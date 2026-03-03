'use client';

import { useState, useRef, useCallback } from 'react';
import type { Model3DAsset } from '@/lib/types';
import { Model3DUploadPopover } from '@/components/map/Model3DUploadPopover';

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
  x: number;       // normalized 0-1 on master
  y: number;
  label: string;
  footprint?: { x: number; y: number; width: number; height: number };
  model3D?: Model3DAsset;
}

interface Props {
  images: UploadedImage[];
  onComplete: (masterId: string, pins: PinnedImage[]) => void;
  onBack: () => void;
}

type Tool = 'pin' | 'footprint' | 'model3d';

export function Step2MasterPin({ images, onComplete, onBack }: Props) {
  const [masterImageId, setMasterImageId] = useState<string | null>(null);
  const [pins, setPins] = useState<PinnedImage[]>([]);
  const [selectedForPin, setSelectedForPin] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('pin');
  const [footprintStart, setFootprintStart] = useState<{ x: number; y: number } | null>(null);
  const [footprintDraw, setFootprintDraw] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [pending3DPos, setPending3DPos] = useState<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const masterImage = images.find(i => i.id === masterImageId);
  const nonMasterImages = images.filter(i => i.id !== masterImageId);

  const getRelativeCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!masterImageId) return;
    if (tool === 'model3d') {
      // 3D pin placement: click to place, then show upload popover
      const pos = getRelativeCoords(e);
      setPending3DPos(pos);
      return;
    }
    if (tool !== 'pin') return;
    if (!selectedForPin) return;

    const pos = getRelativeCoords(e);

    // Check if this imageId already has a pin
    const existing = pins.find(p => p.imageId === selectedForPin);
    if (existing) {
      // Move existing pin
      setPins(prev => prev.map(p =>
        p.imageId === selectedForPin ? { ...p, x: pos.x, y: pos.y } : p
      ));
    } else {
      const img = images.find(i => i.id === selectedForPin);
      setPins(prev => [...prev, {
        imageId: selectedForPin,
        x: pos.x,
        y: pos.y,
        label: img?.name.replace(/\.[^.]+$/, '') ?? 'Building',
      }]);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool !== 'footprint' || !selectedForPin) return;
    const pos = getRelativeCoords(e);
    setFootprintStart(pos);
    setFootprintDraw(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tool !== 'footprint' || !footprintStart) return;
    const pos = getRelativeCoords(e);
    const x = Math.min(footprintStart.x, pos.x);
    const y = Math.min(footprintStart.y, pos.y);
    const w = Math.abs(pos.x - footprintStart.x);
    const h = Math.abs(pos.y - footprintStart.y);
    setFootprintDraw({ x, y, w, h });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (tool !== 'footprint' || !footprintStart || !footprintDraw || !selectedForPin) {
      setFootprintStart(null);
      return;
    }
    const pos = getRelativeCoords(e);
    if (Math.abs(footprintDraw.w) < 0.01 || Math.abs(footprintDraw.h) < 0.01) {
      setFootprintStart(null);
      setFootprintDraw(null);
      return;
    }

    const footprint = {
      x: Math.min(footprintStart.x, pos.x),
      y: Math.min(footprintStart.y, pos.y),
      width: footprintDraw.w,
      height: footprintDraw.h,
    };

    const center = { x: footprint.x + footprint.width / 2, y: footprint.y + footprint.height / 2 };
    const img = images.find(i => i.id === selectedForPin);

    setPins(prev => {
      const existing = prev.find(p => p.imageId === selectedForPin);
      if (existing) {
        return prev.map(p => p.imageId === selectedForPin ? { ...p, x: center.x, y: center.y, footprint } : p);
      }
      return [...prev, {
        imageId: selectedForPin,
        x: center.x,
        y: center.y,
        label: img?.name.replace(/\.[^.]+$/, '') ?? 'Building',
        footprint,
      }];
    });

    setFootprintStart(null);
    setFootprintDraw(null);
  };

  const removePin = (imageId: string) => {
    setPins(prev => prev.filter(p => p.imageId !== imageId));
  };

  const updatePinLabel = (imageId: string, label: string) => {
    setPins(prev => prev.map(p => p.imageId === imageId ? { ...p, label } : p));
  };

  const canContinue = masterImageId && pins.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: image selector */}
        <div className="space-y-4">
          {/* Master map selection */}
          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-900 text-xs font-bold flex items-center justify-center">1</span>
              Select Master Map
            </h3>
            <p className="text-xs text-slate-500 mb-3">The overview map showing all buildings/areas</p>
            <div className="space-y-2">
              {images.map(img => (
                <button
                  key={img.id}
                  onClick={() => {
                    setMasterImageId(img.id);
                    setPins(pins.filter(p => p.imageId !== img.id));
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                    masterImageId === img.id
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 text-slate-300'
                  }`}
                >
                  <img src={img.url} alt={img.name} className="w-10 h-8 object-cover rounded-md shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{img.name}</p>
                    <p className="text-[10px] text-slate-500">{img.width}×{img.height}</p>
                  </div>
                  {masterImageId === img.id && (
                    <span className="ml-auto shrink-0 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">MASTER</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-map pin placement */}
          {masterImageId && (
            <div>
              <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">2</span>
                Place Building Pins
              </h3>
              <p className="text-xs text-slate-500 mb-3">Select a building, then click on the master map to place its pin</p>

              {/* Tool selector */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setTool('pin')}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${tool === 'pin' ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  Pin Point
                </button>
                <button
                  onClick={() => setTool('footprint')}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${tool === 'footprint' ? 'border-indigo-500/60 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  Draw Area
                </button>
                <button
                  onClick={() => { setTool('model3d'); setSelectedForPin(null); }}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-all ${tool === 'model3d' ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}
                >
                  🧊 3D Model
                </button>
              </div>

              <div className="space-y-2">
                {nonMasterImages.map(img => {
                  const pin = pins.find(p => p.imageId === img.id);
                  const isSelected = selectedForPin === img.id;
                  return (
                    <div key={img.id} className={`rounded-xl border overflow-hidden transition-all ${isSelected ? 'border-indigo-500/60' : 'border-slate-700'}`}>
                      {/* Using div instead of button to avoid invalid nested-button HTML */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedForPin(isSelected ? null : img.id)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelectedForPin(isSelected ? null : img.id)}
                        className={`w-full flex items-center gap-3 p-2.5 text-left transition-all cursor-pointer ${isSelected ? 'bg-indigo-500/10' : 'bg-slate-800/50 hover:bg-slate-800'}`}
                      >
                        <img src={img.url} alt={img.name} className="w-10 h-8 object-cover rounded-md shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-300 truncate">{img.name}</p>
                          {pin ? (
                            <p className="text-[10px] text-green-400">✓ Placed at ({(pin.x * 100).toFixed(0)}%, {(pin.y * 100).toFixed(0)}%)</p>
                          ) : (
                            <p className="text-[10px] text-slate-500">Not placed yet</p>
                          )}
                        </div>
                        {pin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removePin(img.id); }}
                            className="text-red-400 hover:text-red-300 p-1"
                          >
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Label editor */}
                      {pin && isSelected && (
                        <div className="px-3 pb-3">
                          <input
                            type="text"
                            value={pin.label}
                            onChange={e => updatePinLabel(img.id, e.target.value)}
                            placeholder="Building label..."
                            className="w-full bg-slate-900 border border-slate-600 text-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: master map preview with pins */}
        <div className="lg:col-span-2">
          {!masterImageId ? (
            <div className="h-80 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center">
              <div className="text-center text-slate-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-12 h-12 mx-auto mb-2 opacity-50">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
                <p className="text-sm">Select the master map first</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {tool === 'model3d'
                    ? 'Click on the map to place a 3D model pin'
                    : selectedForPin
                      ? tool === 'pin'
                        ? `Click to place pin for "${images.find(i => i.id === selectedForPin)?.name}"`
                        : `Drag to draw area for "${images.find(i => i.id === selectedForPin)?.name}"`
                      : 'Select a building to place its pin'}
                </p>
                <span className="text-xs text-slate-500">{pins.length} pins placed</span>
              </div>

              {/* Interactive map canvas */}
              <div
                ref={canvasRef}
                className={`relative rounded-2xl overflow-hidden border border-slate-700 select-none ${
                  tool === 'model3d' ? 'cursor-crosshair' : selectedForPin ? (tool === 'pin' ? 'cursor-crosshair' : 'cursor-crosshair') : 'cursor-default'
                }`}
                style={{ aspectRatio: `${masterImage?.width ?? 16}/${masterImage?.height ?? 9}` }}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <img
                  src={masterImage!.url}
                  alt="Master map"
                  className="w-full h-full object-contain bg-slate-900"
                  draggable={false}
                />

                {/* Footprint drawings */}
                {pins.filter(p => p.footprint).map(pin => {
                  const img = images.find(i => i.id === pin.imageId);
                  const fp = pin.footprint!;
                  return (
                    <div
                      key={`fp_${pin.imageId}`}
                      className="absolute border-2 border-indigo-400/60 bg-indigo-500/10 rounded"
                      style={{
                        left: `${fp.x * 100}%`,
                        top: `${fp.y * 100}%`,
                        width: `${fp.width * 100}%`,
                        height: `${fp.height * 100}%`,
                      }}
                    >
                      <span className="absolute top-0.5 left-0.5 text-[9px] text-indigo-300 bg-indigo-900/80 px-1 rounded">
                        {pin.label || img?.name}
                      </span>
                    </div>
                  );
                })}

                {/* Live footprint drawing */}
                {footprintDraw && (
                  <div
                    className="absolute border-2 border-dashed border-indigo-400 bg-indigo-500/10 pointer-events-none"
                    style={{
                      left: `${footprintDraw.x * 100}%`,
                      top: `${footprintDraw.y * 100}%`,
                      width: `${footprintDraw.w * 100}%`,
                      height: `${footprintDraw.h * 100}%`,
                    }}
                  />
                )}

                {/* Pins */}
                {pins.map(pin => {
                  const img = images.find(i => i.id === pin.imageId);
                  const isActive = selectedForPin === pin.imageId;
                  const is3D = !!pin.model3D;
                  return (
                    <div
                      key={`pin_${pin.imageId}`}
                      className="absolute transform -translate-x-1/2 -translate-y-full"
                      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                    >
                      {/* Pulse ring */}
                      {isActive && (
                        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 ${is3D ? 'border-cyan-400' : 'border-indigo-400'} animate-ping opacity-75`} />
                      )}
                      {/* Pin marker */}
                      <div className={`relative flex flex-col items-center ${isActive ? 'scale-125' : ''} transition-transform`}>
                        <div className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shadow-lg shadow-black/50 ${
                          is3D ? 'bg-cyan-600' : isActive ? 'bg-indigo-500' : 'bg-indigo-700'
                        }`}>
                          {is3D ? (
                            <span className="text-xs">🧊</span>
                          ) : (
                            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-white">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div className={`w-0.5 h-2 ${is3D ? 'bg-cyan-600' : 'bg-indigo-600'}`} />
                        <span className="absolute top-full mt-1 px-1.5 py-0.5 bg-slate-900/90 text-white text-[9px] rounded whitespace-nowrap max-w-20 truncate border border-slate-700">
                          {pin.label || img?.name}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* 3D upload popover */}
                {pending3DPos && (
                  <div
                    className="absolute z-30"
                    style={{
                      left: `${pending3DPos.x * 100}%`,
                      top: `${pending3DPos.y * 100}%`,
                      transform: 'translate(-50%, -110%)',
                    }}
                  >
                    <Model3DUploadPopover
                      defaultLabel={`3D Point ${pins.filter(p => p.model3D).length + 1}`}
                      onCancel={() => setPending3DPos(null)}
                      onUpload={(asset) => {
                        setPins(prev => [...prev, {
                          imageId: `__3d_${crypto.randomUUID()}`,
                          x: pending3DPos.x,
                          y: pending3DPos.y,
                          label: asset.label || '3D Model',
                          model3D: asset,
                        }]);
                        setPending3DPos(null);
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Tip */}
              <p className="text-xs text-slate-500">
                💡 "Pin Point" links to a building. "Draw Area" outlines a footprint. "3D Model" places a standalone 3D reconstruction pin.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-xl transition-all text-sm"
        >
          Back
        </button>
        <button
          onClick={() => canContinue && onComplete(masterImageId!, pins)}
          disabled={!canContinue}
          className={`px-8 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
            canContinue
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          Configure Floor Plans
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
}
