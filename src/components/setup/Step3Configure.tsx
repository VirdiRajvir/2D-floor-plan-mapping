'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WalkabilityConfig, SerializedWalkabilityGrid } from '@/lib/types';
import { processFloorPlanImage } from '@/lib/imageProcessor';
import { getOpenAIKey } from '@/components/ApiKeySettings';

interface UploadedImage {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  file: File;
}

interface PinnedImage {
  imageId: string;
  x: number;
  y: number;
  label: string;
}

interface SubMapConfig {
  imageId: string;
  walkabilityConfig: WalkabilityConfig;
  walkabilityReady: boolean;
  walkabilityGrid?: SerializedWalkabilityGrid;
  pendingAIDetection?: boolean;
  doorMarkers?: { id: string; x: number; y: number }[];
  entryPoints?: { x: number; y: number }[];
  exitPoints?: { x: number; y: number }[];
}

type AnnotationTool = 'door' | 'entry' | 'exit' | null;
type AnnotationSet = {
  doorMarkers: { id: string; x: number; y: number }[];
  entryPoints: { x: number; y: number }[];
  exitPoints: { x: number; y: number }[];
};

interface Props {
  images: UploadedImage[];
  pinnedImages: PinnedImage[];
  masterImageId: string;
  saving: boolean;
  onComplete: (configs: SubMapConfig[]) => void;
  onBack: () => void;
}

const DEFAULT_CONFIG: WalkabilityConfig = { threshold: 128, dilation: 2, resolution: 150 };

export function Step3Configure({ images, pinnedImages: allPinnedImages, masterImageId, saving, onComplete, onBack }: Props) {
  // Filter out 3D-only pins — they don't have floor plans to configure
  const pinnedImages = allPinnedImages.filter(p => !p.imageId.startsWith('__3d_'));

  const [activeId, setActiveId] = useState<string | null>(pinnedImages[0]?.imageId ?? null);
  const [configs, setConfigs] = useState<Record<string, WalkabilityConfig>>(() =>
    Object.fromEntries(pinnedImages.map(p => [p.imageId, { ...DEFAULT_CONFIG }]))
  );
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [useAI, setUseAI] = useState(false);
  const [detectingAI, setDetectingAI] = useState(false);
  const [aiSuccess, setAiSuccess] = useState<Record<string, boolean>>({});
  // Stores the computed walkability grid for each pinned image (keyed by imageId)
  const [grids, setGrids] = useState<Record<string, SerializedWalkabilityGrid>>({});
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>(null);
  const [annotations, setAnnotations] = useState<Record<string, AnnotationSet>>({});
  const previewRef = useRef<HTMLDivElement>(null);

  const activeImage = images.find(i => i.id === activeId);
  const activeConfig = configs[activeId ?? ''] ?? DEFAULT_CONFIG;

  const generateOverlay = useCallback(async () => {
    if (!activeImage || !activeId) return;
    setGenerating(true);
    setOverlayUrl(null);

    try {
      const config = configs[activeId] ?? DEFAULT_CONFIG;
      // Load image into a canvas and generate walkability overlay
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = rej;
        img.src = activeImage.url;
      });

      const canvas = document.createElement('canvas');
      const scale = Math.min(800 / img.naturalWidth, 600 / img.naturalHeight);
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      // Apply threshold overlay
      const overlay = ctx.createImageData(width, height);
      const threshold = config.threshold;

      for (let i = 0; i < data.length; i += 4) {
        const brightness = (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
        const walkable = brightness > threshold;
        overlay.data[i] = walkable ? 0 : 255;       // R
        overlay.data[i+1] = walkable ? 200 : 0;      // G
        overlay.data[i+2] = walkable ? 0 : 0;        // B
        overlay.data[i+3] = walkable ? 60 : 120;     // A
      }

      // Draw floor plan image first
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Then overlay
      ctx.putImageData(overlay, 0, 0);

      setOverlayUrl(canvas.toDataURL('image/png'));

      // Also compute and persist the full walkability grid so SubMapView
      // doesn't need to recompute it on every map load.
      try {
        const fullGrid = processFloorPlanImage(img, config.threshold, config.resolution, config.dilation);
        setGrids(prev => ({
          ...prev,
          [activeId]: {
            grid: fullGrid.grid,
            rows: fullGrid.rows,
            cols: fullGrid.cols,
            cellW: fullGrid.cellWidth,
            cellH: fullGrid.cellHeight,
            imageWidth: fullGrid.imageWidth,
            imageHeight: fullGrid.imageHeight,
          },
        }));
      } catch {
        // Non-fatal: SubMapView will fall back to computing on load
      }
    } catch (err) {
      console.error('Overlay generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [activeImage, activeId, configs]);

  // Generate overlay whenever active image or config changes
  useEffect(() => {
    generateOverlay();
  }, [generateOverlay]);

  const updateConfig = (key: keyof WalkabilityConfig, value: number) => {
    if (!activeId) return;
    setConfigs(prev => ({
      ...prev,
      [activeId]: { ...prev[activeId], [key]: value },
    }));
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!annotationTool || !activeId || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const cur: AnnotationSet = annotations[activeId] ?? { doorMarkers: [], entryPoints: [], exitPoints: [] };
    if (annotationTool === 'door') {
      setAnnotations(p => ({ ...p, [activeId]: { ...cur,
        doorMarkers: [...cur.doorMarkers, { id: crypto.randomUUID(), x, y }] } }));
    } else if (annotationTool === 'entry') {
      setAnnotations(p => ({ ...p, [activeId]: { ...cur, entryPoints: [...cur.entryPoints, { x, y }] } }));
    } else {
      setAnnotations(p => ({ ...p, [activeId]: { ...cur, exitPoints: [...cur.exitPoints, { x, y }] } }));
    }
  };

  const runAIDetection = async () => {
    const savedKey = getOpenAIKey();
    if (!activeId || !savedKey) return;
    setDetectingAI(true);
    try {
      // We'll do this via the API route after project is created
      // For now just mark as pending
      setAiSuccess(prev => ({ ...prev, [activeId]: false }));
      setAiSuccess(prev => ({ ...prev, [activeId]: true }));
    } catch {
      // ignore
    } finally {
      setDetectingAI(false);
    }
  };

  const canFinish = pinnedImages.length > 0;

  return (
    <div className="space-y-6">
      {/* Windows hint tip */}
      <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/25">
        <span className="text-lg mt-0.5">🪟</span>
        <div>
          <p className="text-xs font-semibold text-blue-300">Tip: Mark Windows on Your Floor Plans</p>
          <p className="text-[11px] text-blue-300/70 mt-0.5">
            For accurate indoor tracking, it&apos;s recommended to annotate windows on your floor plans. Windows affect GPS signal strength and
            can help the system improve positioning accuracy near building perimeters.
            AI element detection will attempt to identify windows automatically.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: image list + controls */}
        <div className="space-y-4">
          {/* Building list */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Buildings to Configure</h3>
            <div className="space-y-2">
              {pinnedImages.map(pin => {
                const img = images.find(i => i.id === pin.imageId);
                const isActive = activeId === pin.imageId;
                return (
                  <button
                    key={pin.imageId}
                    onClick={() => setActiveId(pin.imageId)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
                      isActive
                        ? 'border-amber-500/60 bg-amber-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                    }`}
                  >
                    <img src={img?.url} alt={pin.label} className="w-10 h-8 object-cover rounded-md shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-300 truncate">{pin.label}</p>
                      <p className="text-[10px] text-slate-500">
                        Threshold: {configs[pin.imageId]?.threshold ?? 128}
                      </p>
                    </div>
                    {aiSuccess[pin.imageId] && (
                      <span className="text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded">AI</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Walkability config sliders */}
          {activeId && (
            <div className="bg-slate-800/60 rounded-xl p-4 space-y-4 border border-slate-700">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Wall Detection</h4>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Brightness Threshold</span>
                  <span className="font-mono text-amber-400">{activeConfig.threshold}</span>
                </div>
                <input
                  type="range" min={20} max={240} step={5}
                  value={activeConfig.threshold}
                  onChange={e => updateConfig('threshold', Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                  <span>Dark walls</span><span>Light walls</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Wall Margin</span>
                  <span className="font-mono text-amber-400">{activeConfig.dilation}px</span>
                </div>
                <input
                  type="range" min={0} max={6} step={1}
                  value={activeConfig.dilation}
                  onChange={e => updateConfig('dilation', Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Grid Resolution</span>
                  <span className="font-mono text-amber-400">{activeConfig.resolution}</span>
                </div>
                <input
                  type="range" min={50} max={300} step={10}
                  value={activeConfig.resolution}
                  onChange={e => updateConfig('resolution', Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                  <span>Fast</span><span>Precise</span>
                </div>
              </div>
            </div>
          )}

          {/* AI detection option */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-xs font-semibold text-slate-300">AI Element Detection</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Detect walls, doors, windows, balconies</p>
              </div>
              <button
                onClick={() => setUseAI(!useAI)}
                className={`w-9 h-5 rounded-full transition-all relative ${useAI ? 'bg-cyan-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${useAI ? 'left-4' : 'left-0.5'}`} />
              </button>
            </div>

            {useAI && (
              <div className="space-y-2">
                {getOpenAIKey() ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                    API key configured
                  </div>
                ) : (
                  <p className="text-xs text-amber-400">
                    No API key set. Add one via the ⚙ Settings button on the home page.
                  </p>
                )}
                <button
                  onClick={runAIDetection}
                  disabled={!getOpenAIKey() || detectingAI || !activeId}
                  className="w-full py-2 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {detectingAI ? 'Detecting...' : 'Run AI Detection on Selected'}
                </button>
                <p className="text-[10px] text-slate-600">AI detection will run after project creation</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: preview */}
        <div className="lg:col-span-2">
          {activeImage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-300">{activeImage.name}</p>
                <div className="flex items-center gap-3">
                  {generating && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                      Generating overlay...
                    </div>
                  )}
                </div>
              </div>

              {/* Annotation toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                {(['door', 'entry', 'exit'] as const).map(tool => (
                  <button
                    key={tool}
                    onClick={() => setAnnotationTool(prev => prev === tool ? null : tool)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      annotationTool === tool
                        ? tool === 'door'
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : tool === 'entry'
                          ? 'bg-green-500/20 border-green-500/50 text-green-300'
                          : 'bg-red-500/20 border-red-500/50 text-red-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tool === 'door' ? '🚪 Door' : tool === 'entry' ? '↙ Entry' : '↗ Exit'}
                  </button>
                ))}
                {activeId && (
                  (annotations[activeId]?.doorMarkers.length ?? 0) +
                  (annotations[activeId]?.entryPoints.length ?? 0) +
                  (annotations[activeId]?.exitPoints.length ?? 0) > 0
                ) && (
                  <button
                    onClick={() => setAnnotations(p => ({ ...p, [activeId!]: { doorMarkers: [], entryPoints: [], exitPoints: [] } }))}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-500 hover:text-slate-300"
                  >
                    Clear
                  </button>
                )}
                <span className="text-[10px] text-slate-500 ml-1">
                  {annotationTool ? `Click map to place ${annotationTool} (optional)` : 'Select annotation tool (optional)'}
                </span>
              </div>

              {/* Image with overlay */}
              <div
                ref={previewRef}
                className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900"
                style={{ cursor: annotationTool ? 'crosshair' : 'default' }}
                onClick={handlePreviewClick}
              >
                <img
                  src={activeImage.url}
                  alt={activeImage.name}
                  className="w-full object-contain max-h-[480px]"
                />
                {overlayUrl && (
                  <img
                    src={overlayUrl}
                    alt="walkability overlay"
                    className="absolute inset-0 w-full h-full object-contain mix-blend-multiply opacity-70"
                  />
                )}
                {/* Annotation markers SVG overlay */}
                {activeId && annotations[activeId] && (
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    {annotations[activeId].doorMarkers.map(m => (
                      <g key={m.id}>
                        <circle cx={m.x * 100} cy={m.y * 100} r={1.8} fill="#f59e0b" opacity={0.9} />
                        <text x={m.x * 100 + 2.5} y={m.y * 100 + 1.5} fontSize={3.5} fill="#f59e0b">🚪</text>
                      </g>
                    ))}
                    {annotations[activeId].entryPoints.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x * 100} cy={p.y * 100} r={1.8} fill="#22c55e" opacity={0.9} />
                        <text x={p.x * 100 + 2.5} y={p.y * 100 + 1.5} fontSize={3.5} fill="#22c55e">↙</text>
                      </g>
                    ))}
                    {annotations[activeId].exitPoints.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x * 100} cy={p.y * 100} r={1.8} fill="#ef4444" opacity={0.9} />
                        <text x={p.x * 100 + 2.5} y={p.y * 100 + 1.5} fontSize={3.5} fill="#ef4444">↗</text>
                      </g>
                    ))}
                  </svg>
                )}
              </div>

              {/* Legend */}
              <div className="flex gap-4 text-[10px] text-slate-500">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-green-500/50" />
                  <span>Walkable (open space)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-800/70" />
                  <span>Wall / Blocked</span>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Adjust the threshold to correctly identify walls. After creating the project you can run AI detection for precise wall/door/window classification.
              </p>
            </div>
          ) : (
            <div className="h-60 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center">
              <p className="text-slate-500 text-sm">Select a building to preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
        <button
          onClick={onBack}
          disabled={saving}
          className="px-5 py-2.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-xl transition-all text-sm disabled:opacity-50"
        >
          Back
        </button>

        <button
          onClick={() => {
            if (!canFinish) return;
            const allConfigs = pinnedImages.map(p => ({
              imageId: p.imageId,
              walkabilityConfig: configs[p.imageId] ?? DEFAULT_CONFIG,
              walkabilityReady: true,
              walkabilityGrid: grids[p.imageId],
              pendingAIDetection: useAI && !!getOpenAIKey(),
              doorMarkers: annotations[p.imageId]?.doorMarkers ?? [],
              entryPoints: annotations[p.imageId]?.entryPoints ?? [],
              exitPoints: annotations[p.imageId]?.exitPoints ?? [],
            }));
            onComplete(allConfigs);
          }}
          disabled={!canFinish || saving}
          className={`px-8 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            canFinish && !saving
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
              Creating Map...
            </>
          ) : (
            <>
              Create Map Project
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
