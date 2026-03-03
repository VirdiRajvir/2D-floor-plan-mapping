'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { MapProject, MapPin, Model3DAsset } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';
import { MapPins } from './MapPins';

interface Props {
  project: MapProject;
  on3DPinClick?: (asset: Model3DAsset) => void;
}

const ZOOM_SPEED = 0.12;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;

export function MasterMapView({ project, on3DPinClick }: Props) {
  const { masterMap } = project;
  const {
    masterZoom, masterOffset,
    setMasterZoom, setMasterOffset,
    triggerZoomIn,
    isRescueMode, rescuePlacingFor,
    placeRescueMarker,
    rescue,
  } = useMapProjectStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);

  // Fit image to container on load
  const fitToContainer = useCallback(() => {
    if (!containerRef.current || !masterMap.imageUrl) return;
    const rect = containerRef.current.getBoundingClientRect();
    const aspect = masterMap.width / masterMap.height;
    const containerAspect = rect.width / rect.height;
    const scale = containerAspect > aspect
      ? (rect.height * 0.92) / masterMap.height
      : (rect.width * 0.92) / masterMap.width;
    setMasterZoom(scale);
    setMasterOffset({ x: 0, y: 0 });
  }, [masterMap.width, masterMap.height, masterMap.imageUrl, setMasterZoom, setMasterOffset]);

  useEffect(() => {
    if (imgLoaded) fitToContainer();
  }, [imgLoaded, fitToContainer]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED;
    setMasterZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  }, [setMasterZoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isRescueMode && rescuePlacingFor) return;
    if (e.target instanceof SVGElement || (e.target as HTMLElement).closest('[data-pin]')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - masterOffset.x, y: e.clientY - masterOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setMasterOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handlePinClick = useCallback((pin: MapPin) => {
    // 3D pin — open the 3D viewer instead of zooming into sub-map
    if (pin.model3D && on3DPinClick) {
      on3DPinClick(pin.model3D);
      return;
    }
    triggerZoomIn(pin);
  }, [triggerZoomIn, on3DPinClick]);

  // Convert master map click to normalized coords
  const canvasToNormalized = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const mw = (masterMap.width || 800) * masterZoom;
    const mh = (masterMap.height || 600) * masterZoom;
    const imgLeft = rect.width / 2 + masterOffset.x - mw / 2;
    const imgTop = rect.height / 2 + masterOffset.y - mh / 2;
    const relX = (clientX - rect.left - imgLeft) / mw;
    const relY = (clientY - rect.top - imgTop) / mh;
    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
    return { x: relX, y: relY };
  }, [masterMap.width, masterMap.height, masterZoom, masterOffset]);

  // Find closest building pin to a normalized position
  const findNearestPin = useCallback((pos: { x: number; y: number }): MapPin | null => {
    let closest: MapPin | null = null;
    let minDist = Infinity;
    for (const pin of masterMap.pins) {
      if (!pin.subMapId) continue; // skip 3D-only pins
      const d = Math.hypot(pin.x - pos.x, pin.y - pos.y);
      if (d < minDist) { minDist = d; closest = pin; }
    }
    return closest;
  }, [masterMap.pins]);

  const handleMapClick = useCallback((e: React.MouseEvent) => {
    if (!isRescueMode || !rescuePlacingFor) return;
    // Don't handle if click was on a pin
    if ((e.target as HTMLElement).closest('[data-pin]') || e.target instanceof SVGElement) return;
    const pos = canvasToNormalized(e.clientX, e.clientY);
    if (!pos) return;

    // Find the nearest building pin and use its ground floor
    const nearestPin = findNearestPin(pos);
    if (!nearestPin) return;
    const subMap = project.subMaps.find(s => s.id === nearestPin.subMapId);
    if (!subMap || subMap.floors.length === 0) return;
    const groundFloor = subMap.floors[0];

    // Map the master-map coordinates to be relative within the building (use pin center as reference)
    // For simplicity, place the marker at the center of the building's ground floor entry
    placeRescueMarker(subMap.id, groundFloor.id, 0.5, 0.5);
  }, [isRescueMode, rescuePlacingFor, canvasToNormalized, findNearestPin, project.subMaps, placeRescueMarker]);

  if (!masterMap.imageUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <div className="text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-16 h-16 mx-auto mb-3 opacity-30">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
          <p className="text-sm">No master map configured</p>
          <p className="text-xs mt-1 text-slate-600">Go to setup to add a master map</p>
        </div>
      </div>
    );
  }

  const imgW = (masterMap.width || 800) * masterZoom;
  const imgH = (masterMap.height || 600) * masterZoom;

  // Determine cursor
  const cursorClass = (isRescueMode && rescuePlacingFor)
    ? 'cursor-crosshair'
    : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  // Rescue markers that can be shown on master map (find pin position for each)
  const rescuerPin = rescue.rescuer ? masterMap.pins.find(p =>
    p.subMapId === rescue.rescuer!.subMapId
  ) : null;
  const rescueePin = rescue.rescuee ? masterMap.pins.find(p =>
    p.subMapId === rescue.rescuee!.subMapId
  ) : null;

  return (
    <div
      ref={containerRef}
      className={`w-full h-full overflow-hidden relative select-none ${cursorClass}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleMapClick}
    >
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(#818cf8 1px, transparent 1px), linear-gradient(90deg, #818cf8 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Image + pins container */}
      <div
        className="absolute"
        style={{
          left: `calc(50% + ${masterOffset.x}px)`,
          top: `calc(50% + ${masterOffset.y}px)`,
          transform: 'translate(-50%, -50%)',
          width: imgW,
          height: imgH,
        }}
      >
        {/* Floor plan image */}
        <img
          src={masterMap.imageUrl}
          alt="Master map"
          className="w-full h-full object-fill rounded-lg shadow-2xl shadow-black/50"
          draggable={false}
          onLoad={() => setImgLoaded(true)}
          style={{ display: imgLoaded ? 'block' : 'none' }}
        />
        {!imgLoaded && (
          <div className="w-full h-full bg-slate-800 rounded-lg flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Footprint rectangles */}
        {masterMap.pins.filter(p => p.footprint).map(pin => {
          const fp = pin.footprint!;
          return (
            <div
              key={`fp_${pin.id}`}
              className="absolute border border-indigo-400/30 bg-indigo-500/5 rounded pointer-events-none"
              style={{
                left: `${fp.x * 100}%`,
                top: `${fp.y * 100}%`,
                width: `${fp.width * 100}%`,
                height: `${fp.height * 100}%`,
              }}
            />
          );
        })}

        {/* SVG overlay for pins */}
        {imgLoaded && (
          <svg
            className="absolute inset-0 w-full h-full overflow-visible"
            viewBox={`0 0 ${masterMap.width || 800} ${masterMap.height || 600}`}
            preserveAspectRatio="none"
          >
            <MapPins
              pins={masterMap.pins}
              imageWidth={masterMap.width || 800}
              imageHeight={masterMap.height || 600}
              onPinClick={handlePinClick}
              hoveredPinId={hoveredPin}
              onPinHover={setHoveredPin}
              project={project}
            />

            {/* Rescue markers shown at building pin locations */}
            {rescuerPin && (
              <MasterRescueMarker
                x={rescuerPin.x * (masterMap.width || 800)}
                y={rescuerPin.y * (masterMap.height || 600)}
                color="#f59e0b"
                icon="🔥"
                label="Rescuer"
              />
            )}
            {rescueePin && (
              <MasterRescueMarker
                x={rescueePin.x * (masterMap.width || 800)}
                y={rescueePin.y * (masterMap.height || 600)}
                color="#ef4444"
                icon="🆘"
                label="Rescuee"
              />
            )}
          </svg>
        )}
      </div>

      {/* Rescue placement hint on master map */}
      {isRescueMode && rescuePlacingFor && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
          <div className={`px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm ${
            rescuePlacingFor === 'rescuer'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-red-500/20 border-red-500/40 text-red-300'
          }`}>
            {rescuePlacingFor === 'rescuer'
              ? '🔥 Click near a building to place Rescuer'
              : '🆘 Click near a building to place Rescuee'}
          </div>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
        <button
          onClick={() => setMasterZoom(v => Math.min(MAX_ZOOM, v + 0.3))}
          className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all backdrop-blur-sm text-base leading-none"
        >+</button>
        <button
          onClick={fitToContainer}
          className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all backdrop-blur-sm"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={() => setMasterZoom(v => Math.max(MIN_ZOOM, v - 0.3))}
          className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all backdrop-blur-sm text-base leading-none"
        >−</button>
      </div>

      {/* Pin count indicator */}
      {masterMap.pins.length > 0 && (
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-slate-800/90 backdrop-blur-sm rounded-full text-xs text-slate-400 border border-slate-700">
          {masterMap.pins.length} pin{masterMap.pins.length !== 1 ? 's' : ''} — click to explore
        </div>
      )}
    </div>
  );
}

/** Rescue marker shown on the master map at building pin locations */
function MasterRescueMarker({ x, y, color, icon, label }: { x: number; y: number; color: string; icon: string; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={22} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4}>
        <animate attributeName="r" from="16" to="28" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r={15} fill={`${color}25`} stroke={color} strokeWidth={2} />
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={11} style={{ userSelect: 'none' }}>
        {icon}
      </text>
      <rect x={x - 28} y={y + 18} width={56} height={14} rx={4} fill="rgba(10,13,20,0.9)" />
      <text x={x} y={y + 25} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill={color} fontWeight="bold" style={{ userSelect: 'none' }}>
        {label}
      </text>
    </g>
  );
}
