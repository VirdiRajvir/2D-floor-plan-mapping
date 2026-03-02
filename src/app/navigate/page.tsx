'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import NavigableMap from '@/components/NavigableMap';
import { processFloorPlanImage, getGridStats, type RoomLabel } from '@/lib/imageProcessor';
import type { WalkabilityGrid } from '@/lib/walkabilityGrid';

type PageState = 'upload' | 'configure' | 'map';

export default function NavigatePage() {
  const [state, setState] = useState<PageState>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);

  // Configuration
  const [threshold, setThreshold] = useState(200);
  const [wallDilation, setWallDilation] = useState(2);
  const [resolution, setResolution] = useState(150);

  // Results
  const [walkGrid, setWalkGrid] = useState<WalkabilityGrid | null>(null);
  const [rooms, setRooms] = useState<RoomLabel[]>([]);
  const [stats, setStats] = useState<{ walkable: number; blocked: number; percent: number } | null>(null);

  // Preview
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setRooms([]);

    // Load image element
    const img = new Image();
    img.onload = () => {
      setImageEl(img);
      setState('configure');
    };
    img.src = url;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setRooms([]);

    const img = new Image();
    img.onload = () => {
      setImageEl(img);
      setState('configure');
    };
    img.src = url;
  }, []);

  // Process and preview whenever parameters change
  useEffect(() => {
    if (!imageEl || state !== 'configure') return;

    const grid = processFloorPlanImage(imageEl, threshold, resolution, wallDilation);
    setWalkGrid(grid);
    setStats(getGridStats(grid));

    // Render preview
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const maxW = 800;
    const aspect = imageEl.naturalWidth / imageEl.naturalHeight;
    const w = Math.min(maxW, imageEl.naturalWidth);
    const h = w / aspect;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imageEl, 0, 0, w, h);

    // Overlay walkability
    const scaleX = w / grid.cols;
    const scaleY = h / grid.rows;
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        ctx.fillStyle = grid.grid[r][c]
          ? 'rgba(34, 197, 94, 0.18)'
          : 'rgba(239, 68, 68, 0.30)';
        ctx.fillRect(c * scaleX, r * scaleY, scaleX + 0.5, scaleY + 0.5);
      }
    }
  }, [imageEl, threshold, wallDilation, resolution, state]);

  const handleGenerate = useCallback(() => {
    if (!walkGrid) return;
    setState('map');
  }, [walkGrid]);

  const handleAddRoom = useCallback((room: RoomLabel) => {
    setRooms((prev) => [...prev, room]);
  }, []);

  const handleRemoveRoom = useCallback((id: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div>
                <h1 className="text-white font-bold text-lg leading-tight">Navigate Map</h1>
                <p className="text-gray-500 text-xs">Interactive walkable floor plan</p>
              </div>
            </a>
          </div>
          <div className="flex items-center gap-3">
            {state !== 'upload' && (
              <button
                onClick={() => {
                  setState('upload');
                  setWalkGrid(null);
                  setImageEl(null);
                  setStats(null);
                  setRooms([]);
                }}
                className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                ← New Image
              </button>
            )}
            {state === 'map' && (
              <button
                onClick={() => setState('configure')}
                className="px-3 py-1.5 text-sm bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
              >
                ⚙ Adjust
              </button>
            )}
            <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
              Back to SafeMap
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Upload state */}
        {state === 'upload' && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center cursor-pointer
                         hover:border-emerald-500 hover:bg-emerald-500/5 transition-all"
            >
              <div className="flex flex-col items-center gap-4">
                <svg className="w-14 h-14 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <div>
                  <p className="text-gray-300 text-lg">
                    <span className="text-emerald-400 font-semibold">Click to upload</span> or drag & drop
                  </p>
                  <p className="text-gray-500 text-sm mt-1">Any floor plan image — PNG, JPG, WebP</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* How it works */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-6 space-y-3">
              <h3 className="text-white font-medium">How it works</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-400">
                <div className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                  <span className="bg-emerald-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0">1</span>
                  <div><strong className="text-gray-300">Upload</strong> — Drop any floor plan image</div>
                </div>
                <div className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                  <span className="bg-emerald-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0">2</span>
                  <div><strong className="text-gray-300">Tune</strong> — Adjust the threshold slider until walls are red and corridors are green</div>
                </div>
                <div className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                  <span className="bg-emerald-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0">3</span>
                  <div><strong className="text-gray-300">Navigate</strong> — Click to place yourself, WASD to move</div>
                </div>
                <div className="flex items-start gap-3 bg-gray-800/50 rounded-lg p-3">
                  <span className="bg-emerald-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0">4</span>
                  <div><strong className="text-gray-300">Pathfind</strong> — Right-click to find the shortest route via A*</div>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                No API calls needed. Processing happens instantly in your browser.
              </p>
            </div>
          </>
        )}

        {/* Configure state — threshold tuning */}
        {state === 'configure' && imageEl && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              {/* Preview */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <canvas
                  ref={previewCanvasRef}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>

              {/* Controls sidebar */}
              <div className="space-y-5">
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
                  <h3 className="text-white font-medium text-lg">Walkability Settings</h3>

                  {/* Threshold slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm text-gray-400">Brightness Threshold</label>
                      <span className="text-sm text-emerald-400 font-mono">{threshold}</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={250}
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Pixels brighter than this = walkable. Lower = more walkable area.
                    </p>
                  </div>

                  {/* Wall margin slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm text-gray-400">Wall Margin</label>
                      <span className="text-sm text-emerald-400 font-mono">{wallDilation}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={6}
                      value={wallDilation}
                      onChange={(e) => setWallDilation(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Extra buffer around walls to prevent walking through narrow gaps.
                    </p>
                  </div>

                  {/* Resolution slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm text-gray-400">Grid Resolution</label>
                      <span className="text-sm text-emerald-400 font-mono">{resolution}</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={300}
                      step={10}
                      value={resolution}
                      onChange={(e) => setResolution(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                    <p className="text-xs text-gray-600 mt-1">
                      Higher = more precise, but slower pathfinding.
                    </p>
                  </div>
                </div>

                {/* Stats */}
                {stats && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-2xl font-bold text-emerald-400">{stats.percent}%</div>
                        <div className="text-xs text-gray-500">Walkable</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-400">{stats.walkable.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">Open cells</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-400">{stats.blocked.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">Blocked cells</div>
                      </div>
                    </div>
                    {/* Walkability bar */}
                    <div className="mt-3 h-2 bg-red-500/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/50 rounded-full transition-all"
                        style={{ width: `${stats.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={!walkGrid}
                  className="w-full px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700
                             text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Start Navigating
                </button>
              </div>
            </div>
          </>
        )}

        {/* Map state */}
        {state === 'map' && walkGrid && imageUrl && (
          <NavigableMap
            imageUrl={imageUrl}
            walkGrid={walkGrid}
            rooms={rooms}
            onAddRoom={handleAddRoom}
            onRemoveRoom={handleRemoveRoom}
          />
        )}
      </main>
    </div>
  );
}
