'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FloorPlanOutline, CanvasDrawOp } from '@/lib/floorplanExtractor';

type ViewMode = 'side-by-side' | 'overlay' | 'outline-only';

/**
 * Client-side canvas renderer for FloorPlanOutline
 */
function drawOnCanvas(
  canvas: HTMLCanvasElement,
  outline: FloorPlanOutline,
  mode: 'clean' | 'overlay',
  originalImage?: HTMLImageElement
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height, outerBoundary, walls, obstacles } = outline;
  canvas.width = width;
  canvas.height = height;

  // Clear
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // If overlay mode, draw the original image underneath with opacity
  if (mode === 'overlay' && originalImage) {
    ctx.globalAlpha = 0.25;
    ctx.drawImage(originalImage, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  // Draw outer boundary
  if (outerBoundary.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(outerBoundary[0].x * width, outerBoundary[0].y * height);
    for (let i = 1; i < outerBoundary.length; i++) {
      ctx.lineTo(outerBoundary[i].x * width, outerBoundary[i].y * height);
    }
    ctx.closePath();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }

  // Draw walls
  ctx.strokeStyle = 'black';
  ctx.lineCap = 'square';
  for (const wall of walls) {
    ctx.beginPath();
    ctx.lineWidth = wall.thickness || 3;
    ctx.moveTo(wall.x1 * width, wall.y1 * height);
    ctx.lineTo(wall.x2 * width, wall.y2 * height);
    ctx.stroke();
  }

  // Draw obstacles
  ctx.fillStyle = 'black';
  for (const obs of obstacles) {
    const rx = obs.x * width;
    const ry = obs.y * height;
    const rw = obs.width * width;
    const rh = obs.height * height;

    if (obs.rotation && obs.rotation !== 0) {
      ctx.save();
      ctx.translate(rx + rw / 2, ry + rh / 2);
      ctx.rotate((obs.rotation * Math.PI) / 180);
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      ctx.restore();
    } else {
      ctx.fillRect(rx, ry, rw, rh);
    }
  }
}

export default function FloorPlanExtractorUI() {
  const [apiKey, setApiKey] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [outline, setOutline] = useState<FloorPlanOutline | null>(null);
  const [svgString, setSvgString] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [passes, setPasses] = useState(2);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('openai_api_key');
    if (saved) setApiKey(saved);
  }, []);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('openai_api_key', key);
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setOutline(null);
    setSvgString(null);
    setError(null);
    setStats(null);

    // Preload image element for overlay
    const img = new Image();
    img.src = URL.createObjectURL(file);
    originalImageRef.current = img;
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setOutline(null);
    setSvgString(null);
    setError(null);
    setStats(null);

    const img = new Image();
    img.src = URL.createObjectURL(file);
    originalImageRef.current = img;
  }, []);

  const handleExtract = useCallback(async () => {
    if (!imageFile || !apiKey) {
      setError(!apiKey ? 'Please enter your OpenAI API key' : 'Please select an image');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress('Sending image to GPT-4o for analysis...');

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('apiKey', apiKey);
      formData.append('passes', String(passes));
      formData.append('format', 'both');

      const response = await fetch('/api/extract-floorplan', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Extraction failed');
      }

      setOutline(data.outline);
      setSvgString(data.svg);
      setStats(data.stats);
      setProgress('');

      // Draw on canvas
      if (data.outline && canvasRef.current) {
        drawOnCanvas(canvasRef.current, data.outline, 'clean');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setProgress('');
    } finally {
      setIsProcessing(false);
    }
  }, [imageFile, apiKey, passes]);

  // Redraw canvas when viewMode or outline changes
  useEffect(() => {
    if (!outline) return;

    if (viewMode === 'outline-only' || viewMode === 'side-by-side') {
      if (canvasRef.current) {
        drawOnCanvas(canvasRef.current, outline, 'clean');
      }
    }

    if (viewMode === 'overlay' && overlayCanvasRef.current && originalImageRef.current) {
      const img = originalImageRef.current;
      const draw = () => drawOnCanvas(overlayCanvasRef.current!, outline, 'overlay', img);
      if (img.complete) draw();
      else img.onload = draw;
    }
  }, [outline, viewMode]);

  const downloadSVG = () => {
    if (!svgString) return;
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floorplan-outline.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPNG = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floorplan-outline.png';
    a.click();
  };

  const downloadJSON = () => {
    if (!outline) return;
    const blob = new Blob([JSON.stringify(outline, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floorplan-outline.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
              </div>
              <div>
                <h1 className="text-white font-bold text-lg leading-tight">Floor Plan Extractor</h1>
                <p className="text-gray-500 text-xs">Convert plans → pure outlines</p>
              </div>
            </a>
          </div>
          <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
            ← Back to SafeMap
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* API Key + Settings */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1.5">OpenAI API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-800 text-white px-4 py-2.5 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none text-sm"
              />
              <p className="text-xs text-gray-600 mt-1">Stored locally in your browser. Never sent to our server.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Analysis Passes</label>
              <select
                value={passes}
                onChange={(e) => setPasses(Number(e.target.value))}
                className="w-full bg-gray-800 text-white px-4 py-2.5 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none text-sm"
              >
                <option value={1}>1 pass (fast, lower accuracy)</option>
                <option value={2}>2 passes (recommended)</option>
                <option value={3}>3 passes (highest accuracy)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Upload area */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer
                     hover:border-purple-500 hover:bg-purple-500/5 transition-all"
        >
          {imagePreview ? (
            <div className="flex flex-col items-center gap-3">
              <img src={imagePreview} alt="Floor plan" className="max-h-40 rounded-lg" />
              <p className="text-gray-400 text-sm">{imageFile?.name} — Click or drop to replace</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-gray-400">
                <span className="text-purple-400 font-medium">Click to upload</span> or drag & drop a floor plan image
              </p>
              <p className="text-xs text-gray-600">PNG, JPG, WebP supported</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Extract button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleExtract}
            disabled={isProcessing || !imageFile || !apiKey}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500
                       text-white rounded-xl font-medium transition-colors flex items-center gap-2"
          >
            {isProcessing ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Extract Outline
              </>
            )}
          </button>

          {progress && (
            <span className="text-sm text-purple-400 animate-pulse">{progress}</span>
          )}

          {error && (
            <span className="text-sm text-red-400">{error}</span>
          )}
        </div>

        {/* Results */}
        {outline && (
          <>
            {/* Stats bar */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-purple-400">{outline.outerBoundary.length}</p>
                <p className="text-xs text-gray-500 mt-1">Boundary Points</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-400">{outline.walls.length}</p>
                <p className="text-xs text-gray-500 mt-1">Wall Segments</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-yellow-400">{outline.obstacles.length}</p>
                <p className="text-xs text-gray-500 mt-1">Obstacles</p>
              </div>
              <div className="bg-gray-800 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-400">{outline.width}×{outline.height}</p>
                <p className="text-xs text-gray-500 mt-1">Output Size</p>
              </div>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-2">
              {(['side-by-side', 'overlay', 'outline-only'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {mode.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </button>
              ))}

              <div className="flex-1" />

              {/* Download buttons */}
              <button onClick={downloadSVG} className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
                ↓ SVG
              </button>
              <button onClick={downloadPNG} className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
                ↓ PNG
              </button>
              <button onClick={downloadJSON} className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700">
                ↓ JSON
              </button>
            </div>

            {/* Visual output */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              {viewMode === 'side-by-side' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-2 text-center font-medium">ORIGINAL</p>
                    <div className="bg-white rounded-lg overflow-hidden">
                      {imagePreview && (
                        <img src={imagePreview} alt="Original" className="w-full h-auto" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2 text-center font-medium">EXTRACTED OUTLINE</p>
                    <div className="bg-white rounded-lg overflow-hidden">
                      <canvas ref={canvasRef} className="w-full h-auto" />
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'overlay' && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 text-center font-medium">OVERLAY (original at 25% opacity)</p>
                  <div className="bg-white rounded-lg overflow-hidden max-w-3xl mx-auto">
                    <canvas ref={overlayCanvasRef} className="w-full h-auto" />
                  </div>
                </div>
              )}

              {viewMode === 'outline-only' && (
                <div>
                  <p className="text-xs text-gray-500 mb-2 text-center font-medium">PURE OUTLINE</p>
                  <div className="bg-white rounded-lg overflow-hidden max-w-3xl mx-auto">
                    <canvas ref={canvasRef} className="w-full h-auto" />
                  </div>
                </div>
              )}
            </div>

            {/* SVG preview for inline rendering - hidden but used for SVG output */}
            {svgString && (
              <details className="bg-gray-900 rounded-xl border border-gray-800">
                <summary className="px-4 py-3 text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                  View raw SVG code
                </summary>
                <pre className="px-4 pb-4 text-xs text-gray-500 overflow-x-auto max-h-64 overflow-y-auto font-mono">
                  {svgString}
                </pre>
              </details>
            )}
          </>
        )}
      </main>
    </div>
  );
}
