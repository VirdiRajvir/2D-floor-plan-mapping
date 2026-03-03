'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { MapProject, MapPin, Model3DAsset } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';
import { MapPins } from './MapPins';
import { PathLayer } from './PathLayer';
import { MASTER_MAP_ID } from '@/lib/universalPathfinder';

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
    updateMasterMap,
    persistProject,
  } = useMapProjectStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);

  // Red zone drawing state
  const [zoneMode, setZoneMode] = useState(false);
  const [zoneDragStart, setZoneDragStart] = useState<{ x: number; y: number } | null>(null);
  const [zoneDragCurrent, setZoneDragCurrent] = useState<{ x: number; y: number } | null>(null);

  const { recalculateRescuePath } = useMapProjectStore();

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
    // Zone drawing mode — capture start position
    if (zoneMode) {
      const pos = canvasToNormalized(e.clientX, e.clientY);
      if (pos) { setZoneDragStart(pos); setZoneDragCurrent(pos); }
      return;
    }
    if (isRescueMode && rescuePlacingFor) return;
    if (e.target instanceof SVGElement || (e.target as HTMLElement).closest('[data-pin]')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - masterOffset.x, y: e.clientY - masterOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Zone draw preview
    if (zoneMode && zoneDragStart) {
      const pos = canvasToNormalized(e.clientX, e.clientY);
      if (pos) setZoneDragCurrent(pos);
      return;
    }
    if (!isDragging) return;
    setMasterOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    // Commit zone if drawn with meaningful area
    if (zoneMode && zoneDragStart && zoneDragCurrent) {
      const x = Math.min(zoneDragStart.x, zoneDragCurrent.x);
      const y = Math.min(zoneDragStart.y, zoneDragCurrent.y);
      const w = Math.abs(zoneDragCurrent.x - zoneDragStart.x);
      const h = Math.abs(zoneDragCurrent.y - zoneDragStart.y);
      if (w > 0.005 && h > 0.005) {
        const newZone = { id: crypto.randomUUID(), x, y, w, h };
        const zones = [...(masterMap.permanentBlockedZones ?? []), newZone];
        updateMasterMap({ permanentBlockedZones: zones });
        persistProject();
        recalculateRescuePath();
      }
      setZoneDragStart(null);
      setZoneDragCurrent(null);
      return;
    }
    setIsDragging(false);
  };

  const handlePinClick = useCallback((pin: MapPin) => {
    // 3D pin — open the 3D viewer instead of zooming into sub-map
    if (pin.model3D && on3DPinClick) {
      on3DPinClick(pin.model3D);
      return;
    }
    // Navigate into the sub-map (rescue mode too — user picks a precise point inside)
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

  // In rescue mode, markers are placed inside rooms (click a building pin to enter).
  // No direct placement on the master map.
  const handleMapClick = useCallback((_e: React.MouseEvent) => {
    if (zoneMode) return; // zone drawing uses mousedown/up events
    // no-op — rescue placement happens inside sub-maps
  }, [zoneMode]);

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
  const cursorClass = zoneMode
    ? 'cursor-crosshair'
    : (isRescueMode && rescuePlacingFor)
    ? 'cursor-crosshair'
    : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  // Rescue markers — show at actual click position for master-map markers,
  // or at building pin position for sub-map markers
  const rescuerPos = rescue.rescuer ? (
    rescue.rescuer.subMapId === MASTER_MAP_ID
      ? { x: rescue.rescuer.x, y: rescue.rescuer.y }
      : (() => { const p = masterMap.pins.find(pin => pin.subMapId === rescue.rescuer!.subMapId); return p ? { x: p.x, y: p.y } : null; })()
  ) : null;
  const rescueePos = rescue.rescuee ? (
    rescue.rescuee.subMapId === MASTER_MAP_ID
      ? { x: rescue.rescuee.x, y: rescue.rescuee.y }
      : (() => { const p = masterMap.pins.find(pin => pin.subMapId === rescue.rescuee!.subMapId); return p ? { x: p.x, y: p.y } : null; })()
  ) : null;

  // Path segments that belong on the master map
  const masterPathSegments = rescue.pathSegments.filter(s => s.subMapId === MASTER_MAP_ID);

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
          onError={() => setImgLoaded(true)}
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

            {/* Path segments on master map */}
            {masterPathSegments.map((seg, idx) => seg.points.length > 1 && (
              <PathLayer
                key={`master-path-${idx}`}
                points={seg.points}
                imageWidth={masterMap.width || 800}
                imageHeight={masterMap.height || 600}
                type={seg.type}
              />
            ))}

            {/* Rescue markers */}
            {rescuerPos && (
              <MasterRescueMarker
                x={rescuerPos.x * (masterMap.width || 800)}
                y={rescuerPos.y * (masterMap.height || 600)}
                color="#f59e0b"
                icon="🔥"
                label="Rescuer"
              />
            )}
            {rescueePos && (
              <MasterRescueMarker
                x={rescueePos.x * (masterMap.width || 800)}
                y={rescueePos.y * (masterMap.height || 600)}
                color="#ef4444"
                icon="🆘"
                label="Rescuee"
              />
            )}
          </svg>
        )}

        {/* Permanent red zones SVG */}
        {(masterMap.permanentBlockedZones?.length ?? 0) > 0 && imgLoaded && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${masterMap.width || 800} ${masterMap.height || 600}`}
            preserveAspectRatio="none"
          >
            {(masterMap.permanentBlockedZones ?? []).map(z => {
              const mw = masterMap.width || 800;
              const mh = masterMap.height || 600;
              return (
                <g key={z.id}>
                  <rect
                    x={z.x * mw} y={z.y * mh}
                    width={z.w * mw} height={z.h * mh}
                    fill="rgba(239,68,68,0.25)"
                    stroke="rgba(239,68,68,0.7)"
                    strokeWidth={1.5}
                    strokeDasharray="4 2"
                    style={{ pointerEvents: zoneMode ? 'auto' : 'none', cursor: zoneMode ? 'pointer' : 'default' }}
                    onClick={(e) => {
                      if (!zoneMode) return;
                      e.stopPropagation();
                      const zones = (masterMap.permanentBlockedZones ?? []).filter(pz => pz.id !== z.id);
                      updateMasterMap({ permanentBlockedZones: zones });
                      persistProject();
                      recalculateRescuePath();
                    }}
                  />
                  <text
                    x={(z.x + z.w / 2) * mw}
                    y={(z.y + z.h / 2) * mh}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fill="rgba(239,68,68,0.8)"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}
                  >⛔</text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Live zone draw preview */}
        {zoneMode && zoneDragStart && zoneDragCurrent && (
          <div
            className="absolute pointer-events-none border-2 border-dashed border-red-500 bg-red-500/20"
            style={{
              left: `${Math.min(zoneDragStart.x, zoneDragCurrent.x) * 100}%`,
              top: `${Math.min(zoneDragStart.y, zoneDragCurrent.y) * 100}%`,
              width: `${Math.abs(zoneDragCurrent.x - zoneDragStart.x) * 100}%`,
              height: `${Math.abs(zoneDragCurrent.y - zoneDragStart.y) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Zone mode hint */}
      {zoneMode && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
          <div className="px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm bg-red-600/20 border-red-600/40 text-red-300">
            ⛔ Drag to draw a blocked zone · Click zone to remove
          </div>
        </div>
      )}

      {/* Rescue placement hint on master map */}
      {isRescueMode && rescuePlacingFor && !zoneMode && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
          <div className={`px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm ${
            rescuePlacingFor === 'rescuer'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-red-500/20 border-red-500/40 text-red-300'
          }`}>
            {rescuePlacingFor === 'rescuer'
              ? '🔥 Click a building to enter and place Rescuer'
              : '🆘 Click a building to enter and place Rescuee'}
          </div>
        </div>
      )}

      {/* Red Zone controls — bottom left */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
        <button
          onClick={() => { setZoneMode(p => !p); setZoneDragStart(null); setZoneDragCurrent(null); }}
          className={`px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all flex items-center gap-1.5 ${
            zoneMode
              ? 'bg-red-600/20 border-red-600/40 text-red-300'
              : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-600/30'
          }`}
        >
          ⛔ Red Zone
        </button>
        {(masterMap.permanentBlockedZones?.length ?? 0) > 0 && (
          <button
            onClick={() => { updateMasterMap({ permanentBlockedZones: [] }); persistProject(); recalculateRescuePath(); }}
            className="px-3 py-1.5 text-xs bg-slate-800/90 hover:bg-slate-700 text-slate-400 border border-slate-700 rounded-lg backdrop-blur-sm transition-all"
          >
            Clear All
          </button>
        )}
        {(masterMap.permanentBlockedZones?.length ?? 0) > 0 && (
          <span className="text-[10px] text-slate-500">
            {masterMap.permanentBlockedZones!.length} zone{masterMap.permanentBlockedZones!.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

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
