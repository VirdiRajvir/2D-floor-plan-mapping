'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { SubMap, FloorLevel, RoomAnnotation, Model3DAsset } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';
import { PathLayer } from './PathLayer';
import { BlockedZoneTool } from './BlockedZoneTool';
import { RoomInfoTooltip } from './RoomInfoTooltip';
import { Model3DUploadPopover } from './Model3DUploadPopover';
import { processFloorPlanImage } from '@/lib/imageProcessor';
import { applyOutlineToGrid } from '@/lib/outlineToGrid';
import type { SerializedWalkabilityGrid } from '@/lib/types';

interface Props {
  subMap: SubMap;
  floor: FloorLevel;
  on3DPinClick?: (asset: Model3DAsset) => void;
  isSetupMode?: boolean;
  /** Current simulated firefighter position (normalized 0-1) from TrackingSimulator */
  simPosition?: { x: number; y: number } | null;
  simPlaying?: boolean;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 10;

export function SubMapView({ subMap, floor, on3DPinClick, isSetupMode = false, simPosition, simPlaying }: Props) {
  const {
    subMapZoom, subMapOffset,
    setSubMapZoom, setSubMapOffset,
    rescue, isRescueMode, rescuePlacingFor,
    placeRescueMarker,
    showWalkabilityOverlay, showElementOverlay,
    toggleWalkabilityOverlay, toggleElementOverlay,
    toggleRescueMode,
    startPlacingRescuer, startPlacingRescuee,
    addRoom, updateRoom, persistProject, recalculateRescuePath,
    updateFloor,
  } = useMapProjectStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [walkGrid, setWalkGrid] = useState<ReturnType<typeof processFloorPlanImage> | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Sub-room navigation — drilled into a room to see/place sub-room pins
  const [focusedRoomId, setFocusedRoomId] = useState<string | null>(null);
  const [subRoomPinMode, setSubRoomPinMode] = useState(false);
  const [pendingSubRoomPos, setPendingSubRoomPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingSubRoomLabel, setPendingSubRoomLabel] = useState('');
  const focusedRoom = focusedRoomId ? floor.rooms.find(r => r.id === focusedRoomId) : null;

  // Pin placement mode (Req 1)
  const [pinMode, setPinMode] = useState(false);
  const [pendingPinPos, setPendingPinPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingPinLabel, setPendingPinLabel] = useState('');

  // Zone drawing mode (Req 3)
  const [zoneMode, setZoneMode] = useState(false);
  const [zoneDragStart, setZoneDragStart] = useState<{ x: number; y: number } | null>(null);
  const [zoneDragCurrent, setZoneDragCurrent] = useState<{ x: number; y: number } | null>(null);

  // 3D pin placement mode
  const [model3dMode, setModel3dMode] = useState(false);
  const [pending3DPinPos, setPending3DPinPos] = useState<{ x: number; y: number } | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);

  // Deserialize a persisted SerializedWalkabilityGrid into the WalkGrid shape
  const deserializeGrid = useCallback(
    (s: SerializedWalkabilityGrid): ReturnType<typeof processFloorPlanImage> => ({
      grid: s.grid,
      rows: s.rows,
      cols: s.cols,
      cellWidth: s.cellW,
      cellHeight: s.cellH,
      imageWidth: s.imageWidth,
      imageHeight: s.imageHeight,
    }),
    [],
  );

  // Load image and generate walkability grid
  useEffect(() => {
    setImgLoaded(false);
    setWalkGrid(null);
    setLoadedImage(null);

    if (!floor.imageUrl) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let grid: ReturnType<typeof processFloorPlanImage>;

        if (floor.walkabilityGrid) {
          // Fast path: use the pre-computed grid saved during setup (no recomputation)
          grid = deserializeGrid(floor.walkabilityGrid);
        } else {
          // Fallback: compute from image brightness threshold
          const { threshold, dilation, resolution } = floor.walkabilityConfig;
          grid = processFloorPlanImage(img, threshold, resolution, dilation);
        }

        // Apply outline semantics: punch door gaps, block restricted zones / balconies
        if (
          floor.outline &&
          (floor.outline.doors.length > 0 ||
            floor.outline.restrictedZones.length > 0 ||
            floor.outline.balconies.length > 0)
        ) {
          grid = applyOutlineToGrid(grid, floor.outline);
        }

        // Apply permanent blocked zones (Req 3)
        if (floor.permanentBlockedZones?.length) {
          const data = grid.grid.map(row => [...row]);
          for (const z of floor.permanentBlockedZones) {
            const c1 = Math.max(0, Math.floor(z.x * (grid.cols - 1)));
            const c2 = Math.min(grid.cols - 1, Math.ceil((z.x + z.w) * (grid.cols - 1)));
            const r1 = Math.max(0, Math.floor(z.y * (grid.rows - 1)));
            const r2 = Math.min(grid.rows - 1, Math.ceil((z.y + z.h) * (grid.rows - 1)));
            for (let r = r1; r <= r2; r++)
              for (let c = c1; c <= c2; c++)
                data[r][c] = false;
          }
          grid = { ...grid, grid: data };
        }

        setWalkGrid(grid);
      } catch (e) {
        console.warn('Walkability grid setup failed:', e);
      }
      setLoadedImage(img);
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.onerror = () => setImgLoaded(true); // still show image for display
    img.src = floor.imageUrl;
  }, [floor.imageUrl, floor.walkabilityConfig, floor.walkabilityGrid, floor.outline, floor.permanentBlockedZones, deserializeGrid]);

  // Fit to container
  const fitToContainer = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const iw = floor.width || 800;
    const ih = floor.height || 600;
    const scale = Math.min(rect.width / iw * 0.9, rect.height / ih * 0.9);
    setSubMapZoom(scale);
    setSubMapOffset({ x: 0, y: 0 });
  }, [floor.width, floor.height, setSubMapZoom, setSubMapOffset]);

  useEffect(() => {
    if (imgLoaded) fitToContainer();
  }, [imgLoaded, fitToContainer]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setSubMapZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)));
  }, [setSubMapZoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Convert canvas coordinates to normalized map coords (defined before mouse handlers)
  const canvasToNormalized = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!containerRef.current) return null;
    const containerRect = containerRef.current.getBoundingClientRect();
    const iw = floor.width || 800;
    const ih = floor.height || 600;
    const imgW = iw * subMapZoom;
    const imgH = ih * subMapZoom;
    const imgLeft = containerRect.width / 2 + subMapOffset.x - imgW / 2;
    const imgTop = containerRect.height / 2 + subMapOffset.y - imgH / 2;

    const relX = (clientX - containerRect.left - imgLeft) / imgW;
    const relY = (clientY - containerRect.top - imgTop) / imgH;

    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
    return { x: relX, y: relY };
  }, [containerRef, floor.width, floor.height, subMapZoom, subMapOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Zone drawing mode — capture start position
    if (zoneMode) {
      const pos = canvasToNormalized(e.clientX, e.clientY);
      if (pos) { setZoneDragStart(pos); setZoneDragCurrent(pos); }
      return;
    }
    if (isRescueMode && rescuePlacingFor) return;
    if ((e.target as HTMLElement).closest('[data-room]')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - subMapOffset.x, y: e.clientY - subMapOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Zone draw preview
    if (zoneMode && zoneDragStart) {
      const pos = canvasToNormalized(e.clientX, e.clientY);
      if (pos) setZoneDragCurrent(pos);
      return;
    }
    if (!isDragging) return;
    setSubMapOffset({
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
      if (w > 0.01 && h > 0.01) {
        const newZone = { id: crypto.randomUUID(), x, y, w, h };
        const zones = [...(floor.permanentBlockedZones ?? []), newZone];
        updateFloor(subMap.id, floor.id, { permanentBlockedZones: zones });
        persistProject();
        recalculateRescuePath();
      }
      setZoneDragStart(null);
      setZoneDragCurrent(null);
      return;
    }
    setIsDragging(false);
  };

  // Click on map — place rescue marker or pin
  const handleMapClick = useCallback((e: React.MouseEvent) => {
    if (zoneMode) return; // zone drawing uses mousedown/up events
    if (model3dMode) {
      const pos = canvasToNormalized(e.clientX, e.clientY);
      if (!pos) return;
      setPending3DPinPos(pos);
      return;
    }
    if (pinMode) {
      const pos = canvasToNormalized(e.clientX, e.clientY);
      if (!pos) return;
      setPendingPinPos(pos);
      setPendingPinLabel(`Location ${floor.rooms.length + 1}`);
      return;
    }
    if (!isRescueMode || !rescuePlacingFor) return;
    const pos = canvasToNormalized(e.clientX, e.clientY);
    if (!pos) return;
    placeRescueMarker(subMap.id, floor.id, pos.x, pos.y);
  }, [zoneMode, model3dMode, pinMode, isRescueMode, rescuePlacingFor, canvasToNormalized, placeRescueMarker, subMap.id, floor.id, floor.rooms.length]);

  // Confirm placement of a room pin (Req 1)
  const confirmPin = useCallback(() => {
    if (!pendingPinPos) return;
    const room: RoomAnnotation = {
      id: crypto.randomUUID(),
      label: pendingPinLabel.trim() || `Location ${floor.rooms.length + 1}`,
      cx: pendingPinPos.x,
      cy: pendingPinPos.y,
    };
    addRoom(subMap.id, floor.id, room);
    persistProject();
    setPendingPinPos(null);
    setPinMode(false);
  }, [pendingPinPos, pendingPinLabel, floor.rooms.length, subMap.id, floor.id, addRoom, persistProject]);

  // Auto-calculate rescue path (Feature B — universal pathfinder)
  useEffect(() => {
    if (!rescue.rescuer || !rescue.rescuee) return;
    recalculateRescuePath();
  }, [rescue.rescuer, rescue.rescuee, rescue.blockedCells, recalculateRescuePath, floor.permanentBlockedZones]);

  const iw = floor.width || 800;
  const ih = floor.height || 600;
  const imgW = iw * subMapZoom;
  const imgH = ih * subMapZoom;

  // Rescue markers on this floor
  const rescuerOnFloor = rescue.rescuer?.floorId === floor.id ? rescue.rescuer : null;
  const rescueeOnFloor = rescue.rescuee?.floorId === floor.id ? rescue.rescuee : null;
  const pathsForFloor = rescue.pathSegments.filter(s => s.floorId === floor.id);

  const cursor = (isRescueMode && rescuePlacingFor) || pinMode || zoneMode || model3dMode
    ? 'cursor-crosshair'
    : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden select-none ${cursor}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false);
        setZoneDragStart(null);
        setZoneDragCurrent(null);
      }}
      onClick={handleMapClick}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `linear-gradient(#818cf8 1px, transparent 1px), linear-gradient(90deg, #818cf8 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Image + overlays container */}
      <div
        className="absolute"
        style={{
          left: `calc(50% + ${subMapOffset.x}px)`,
          top: `calc(50% + ${subMapOffset.y}px)`,
          transform: 'translate(-50%, -50%)',
          width: imgW,
          height: imgH,
        }}
      >
        {/* Floor plan image */}
        {floor.imageUrl && (
          <img
            src={floor.imageUrl}
            alt={floor.label}
            className="w-full h-full object-fill rounded-lg shadow-2xl shadow-black/50"
            draggable={false}
            onLoad={() => setImgLoaded(true)}
          />
        )}

        {/* Walkability overlay (green/red grid) */}
        {showWalkabilityOverlay && walkGrid && imgLoaded && (
          <WalkabilityOverlay grid={walkGrid} />
        )}

        {/* Element overlay (walls, doors, windows from outline) */}
        {showElementOverlay && floor.outline && imgLoaded && (
          <ElementOverlay outline={floor.outline} width={iw} height={ih} />
        )}

        {/* Room clickable overlays */}
        {floor.rooms.map(room => {
          const is3D = !!room.model3D;
          const hasSubRooms = (room.subRooms?.length ?? 0) > 0;
          const isClickable = is3D || hasSubRooms;
          return (
            <div
              key={room.id}
              data-room="true"
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${isClickable ? 'cursor-pointer' : ''}`}
              style={{ left: `${room.cx * 100}%`, top: `${room.cy * 100}%` }}
              onMouseEnter={(e) => {
                setHoveredRoom(room.id);
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => setHoveredRoom(null)}
              onClick={(e) => {
                if (is3D && on3DPinClick) {
                  e.stopPropagation();
                  on3DPinClick(room.model3D!);
                  return;
                }
                if (hasSubRooms) {
                  e.stopPropagation();
                  setFocusedRoomId(room.id);
                  return;
                }
              }}
            >
              <div
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium text-white border whitespace-nowrap ${isClickable ? '' : 'pointer-events-none'}`}
                style={{
                  background: is3D
                    ? 'rgba(6,182,212,0.25)'
                    : hasSubRooms
                    ? 'rgba(168,85,247,0.25)'
                    : room.color ? `${room.color}30` : 'rgba(99,102,241,0.25)',
                  borderColor: is3D
                    ? 'rgba(6,182,212,0.5)'
                    : hasSubRooms
                    ? 'rgba(168,85,247,0.5)'
                    : room.color ? `${room.color}60` : 'rgba(99,102,241,0.4)',
                  backdropFilter: 'blur(2px)',
                }}
              >
                {is3D && <span className="mr-1">🧊</span>}
                {hasSubRooms && <span className="mr-1">📂</span>}
                {room.label}
                {hasSubRooms && <span className="ml-1 text-[8px] opacity-60">({room.subRooms!.length})</span>}
              </div>
            </div>
          );
        })}

        {/* SVG: paths + rescue markers */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${iw} ${ih}`}
          preserveAspectRatio="none"
        >
          {/* All path segments for this floor */}
          {pathsForFloor.map((seg, idx) => seg.points.length > 1 && (
            <PathLayer
              key={idx}
              points={seg.points}
              imageWidth={iw}
              imageHeight={ih}
            />
          ))}

          {/* Rescuer marker (firefighter — amber) */}
          {rescuerOnFloor && (
            <RescueMarker
              x={rescuerOnFloor.x * iw}
              y={rescuerOnFloor.y * ih}
              color="#f59e0b"
              label="Rescuer"
              icon="🔥"
            />
          )}

          {/* Rescuee marker (trapped person — red) */}
          {rescueeOnFloor && (
            <RescueMarker
              x={rescueeOnFloor.x * iw}
              y={rescueeOnFloor.y * ih}
              color="#ef4444"
              label="Rescuee"
              icon="🆘"
            />
          )}

          {/* Animated simulation marker — firefighter moving along path */}
          {simPosition && rescuerOnFloor && (
            <SimulationMarker
              x={simPosition.x * iw}
              y={simPosition.y * ih}
              isPlaying={!!simPlaying}
            />
          )}
        </svg>

        {/* Permanent red zones SVG (Req 3) */}
        {(floor.permanentBlockedZones?.length ?? 0) > 0 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${iw} ${ih}`}
            preserveAspectRatio="none"
          >
            {(floor.permanentBlockedZones ?? []).map(z => (
              <g key={z.id}>
                <rect
                  x={z.x * iw} y={z.y * ih}
                  width={z.w * iw} height={z.h * ih}
                  fill="rgba(239,68,68,0.25)"
                  stroke="rgba(239,68,68,0.7)"
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  style={{ pointerEvents: zoneMode ? 'auto' : 'none', cursor: zoneMode ? 'pointer' : 'default' }}
                  onClick={(e) => {
                    if (!zoneMode) return;
                    e.stopPropagation();
                    const zones = (floor.permanentBlockedZones ?? []).filter(pz => pz.id !== z.id);
                    updateFloor(subMap.id, floor.id, { permanentBlockedZones: zones });
                    persistProject();
                    recalculateRescuePath();
                  }}
                />
                <text
                  x={(z.x + z.w / 2) * iw}
                  y={(z.y + z.h / 2) * ih}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="rgba(239,68,68,0.8)"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >⛔</text>
              </g>
            ))}
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

        {/* Blocked zone tool (rescue mode — dynamic per-rescue blocking) */}
        {isRescueMode && (
          <BlockedZoneTool
            subMapId={subMap.id}
            floorId={floor.id}
            imageWidth={iw}
            imageHeight={ih}
            zoom={subMapZoom}
            offset={subMapOffset}
            container={containerRef}
          />
        )}
      </div>

      {/* Sub-room overlay view — shown when drilled into a room */}
      {focusedRoom && (
        <div className="absolute inset-0 z-30 bg-[#0a0d14]/95 backdrop-blur-md flex flex-col">
          {/* Sub-room header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
            <button
              onClick={() => { setFocusedRoomId(null); setSubRoomPinMode(false); setPendingSubRoomPos(null); }}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div>
              <p className="text-xs text-slate-500">Sub-rooms within</p>
              <h3 className="text-sm font-semibold text-slate-200">{focusedRoom.label}</h3>
            </div>
            {isSetupMode && (
              <button
                onClick={() => { setSubRoomPinMode(p => !p); setPendingSubRoomPos(null); }}
                className={`ml-auto px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all flex items-center gap-1.5 ${
                  subRoomPinMode
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-purple-300 hover:border-purple-500/30'
                }`}
              >
                📌 Add Sub-room Pin
              </button>
            )}
          </div>

          {/* Sub-room content — shows the room as a zoomed/cropped view with sub-pins */}
          <div
            className={`flex-1 relative overflow-hidden ${subRoomPinMode ? 'cursor-crosshair' : ''}`}
            onClick={(e) => {
              if (!subRoomPinMode) return;
              const target = e.currentTarget;
              const rect = target.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              if (x < 0 || x > 1 || y < 0 || y > 1) return;
              setPendingSubRoomPos({ x, y });
              setPendingSubRoomLabel(`Sub-location ${(focusedRoom.subRooms?.length ?? 0) + 1}`);
            }}
          >
            {/* Background: show the room's sub-floor image if available, otherwise the parent floor cropped around the room */}
            {focusedRoom.subFloorImageUrl ? (
              <img
                src={focusedRoom.subFloorImageUrl}
                alt={focusedRoom.label}
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-slate-500 space-y-2">
                  <div className="text-4xl">🏠</div>
                  <p className="text-xs">{focusedRoom.label} — Interior View</p>
                  <p className="text-[10px] text-slate-600">No dedicated floor plan uploaded for this room</p>
                </div>
              </div>
            )}

            {/* Sub-room pins overlay */}
            {(focusedRoom.subRooms ?? []).map(sr => (
              <div
                key={sr.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${sr.cx * 100}%`, top: `${sr.cy * 100}%` }}
              >
                <div
                  className="px-2 py-1 rounded-lg text-[10px] font-medium text-white border whitespace-nowrap cursor-default"
                  style={{
                    background: 'rgba(168,85,247,0.3)',
                    borderColor: 'rgba(168,85,247,0.6)',
                    backdropFilter: 'blur(2px)',
                  }}
                >
                  📌 {sr.label}
                </div>
              </div>
            ))}

            {/* Pending sub-room pin prompt */}
            {pendingSubRoomPos && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900 border border-purple-500/40 rounded-xl p-3 shadow-xl flex items-center gap-2">
                <input
                  autoFocus
                  value={pendingSubRoomLabel}
                  onChange={e => setPendingSubRoomLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (!pendingSubRoomPos || !focusedRoom) return;
                      const newSubRoom: RoomAnnotation = {
                        id: crypto.randomUUID(),
                        label: pendingSubRoomLabel.trim() || `Sub-location ${(focusedRoom.subRooms?.length ?? 0) + 1}`,
                        cx: pendingSubRoomPos.x,
                        cy: pendingSubRoomPos.y,
                      };
                      const updatedSubRooms = [...(focusedRoom.subRooms ?? []), newSubRoom];
                      updateRoom(subMap.id, floor.id, focusedRoom.id, { subRooms: updatedSubRooms });
                      persistProject();
                      setPendingSubRoomPos(null);
                      setSubRoomPinMode(false);
                    }
                    if (e.key === 'Escape') setPendingSubRoomPos(null);
                  }}
                  className="bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-2 py-1 text-xs w-40 focus:outline-none focus:border-purple-500"
                  placeholder="Sub-room name..."
                />
                <button
                  onClick={() => {
                    if (!pendingSubRoomPos || !focusedRoom) return;
                    const newSubRoom: RoomAnnotation = {
                      id: crypto.randomUUID(),
                      label: pendingSubRoomLabel.trim() || `Sub-location ${(focusedRoom.subRooms?.length ?? 0) + 1}`,
                      cx: pendingSubRoomPos.x,
                      cy: pendingSubRoomPos.y,
                    };
                    const updatedSubRooms = [...(focusedRoom.subRooms ?? []), newSubRoom];
                    updateRoom(subMap.id, floor.id, focusedRoom.id, { subRooms: updatedSubRooms });
                    persistProject();
                    setPendingSubRoomPos(null);
                    setSubRoomPinMode(false);
                  }}
                  className="px-2.5 py-1 text-xs bg-purple-500 text-white rounded-lg font-medium"
                >
                  Add
                </button>
                <button onClick={() => setPendingSubRoomPos(null)} className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200">✕</button>
              </div>
            )}

            {/* Sub-room placement hint */}
            {subRoomPinMode && !pendingSubRoomPos && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <div className="px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm bg-purple-500/20 border-purple-500/40 text-purple-300">
                  📌 Click to place a sub-room pin inside {focusedRoom.label}
                </div>
              </div>
            )}

            {/* Empty state */}
            {(focusedRoom.subRooms?.length ?? 0) === 0 && !subRoomPinMode && !pendingSubRoomPos && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
                <div className="px-4 py-2 rounded-xl text-xs border backdrop-blur-sm bg-slate-800/80 border-slate-700 text-slate-500">
                  No sub-rooms yet{isSetupMode ? ' — use "Add Sub-room Pin" to create them' : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending pin label prompt (Req 1) */}
      {pendingPinPos && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900 border border-slate-600 rounded-xl p-3 shadow-xl flex items-center gap-2">
          <input
            autoFocus
            value={pendingPinLabel}
            onChange={e => setPendingPinLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') confirmPin();
              if (e.key === 'Escape') setPendingPinPos(null);
            }}
            className="bg-slate-800 border border-slate-600 text-slate-200 rounded-lg px-2 py-1 text-xs w-40 focus:outline-none focus:border-amber-500"
            placeholder="Location name..."
          />
          <button onClick={confirmPin} className="px-2.5 py-1 text-xs bg-amber-500 text-slate-900 rounded-lg font-medium">Add</button>
          <button onClick={() => setPendingPinPos(null)} className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200">✕</button>
        </div>
      )}

      {/* Controls bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="flex gap-2 flex-wrap pointer-events-auto">
          {/* Walkability toggle */}
          <button
            onClick={toggleWalkabilityOverlay}
            className={`px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all ${
              showWalkabilityOverlay
                ? 'bg-green-500/20 border-green-500/40 text-green-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            Walkability
          </button>

          {/* Element overlay toggle */}
          {floor.outline && (
            <button
              onClick={toggleElementOverlay}
              className={`px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all ${
                showElementOverlay
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Elements
            </button>
          )}

          {/* Rescue mode toggle */}
          <button
            onClick={toggleRescueMode}
            className={`px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all flex items-center gap-1.5 ${
              isRescueMode
                ? 'bg-red-500/20 border-red-500/40 text-red-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/30'
            }`}
          >
            <span>🔥</span>
            Rescue Mode
          </button>

          {/* Pin Location (Req 1) — setup/edit mode only */}
          {isSetupMode && (
            <button
              onClick={() => { setPinMode(p => !p); setPendingPinPos(null); }}
              className={`px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all flex items-center gap-1.5 ${
                pinMode
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-indigo-300 hover:border-indigo-500/30'
              }`}
            >
              📍 Pin Location
            </button>
          )}

          {/* Red Zone (Req 3) — setup/edit mode only */}
          {isSetupMode && (
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
          )}

          {/* 3D Pin — setup/edit mode only */}
          {isSetupMode && (
            <button
              onClick={() => { setModel3dMode(p => !p); setPending3DPinPos(null); }}
              className={`px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all flex items-center gap-1.5 ${
                model3dMode
                  ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30'
              }`}
            >
              🧊 3D Pin
            </button>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex flex-col gap-1.5 pointer-events-auto">
          <button
            onClick={() => setSubMapZoom(v => Math.min(MAX_ZOOM, v + 0.3))}
            className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center backdrop-blur-sm"
          >+</button>
          <button
            onClick={fitToContainer}
            className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-400 flex items-center justify-center backdrop-blur-sm"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => setSubMapZoom(v => Math.max(MIN_ZOOM, v - 0.3))}
            className="w-8 h-8 rounded-lg bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center backdrop-blur-sm"
          >−</button>
        </div>
      </div>

      {/* Room tooltip */}
      {hoveredRoom && floor.rooms.find(r => r.id === hoveredRoom) && (
        <RoomInfoTooltip
          room={floor.rooms.find(r => r.id === hoveredRoom)!}
          position={tooltipPos}
          onSetAsRescuee={() => {
            const room = floor.rooms.find(r => r.id === hoveredRoom)!;
            startPlacingRescuee();
            placeRescueMarker(subMap.id, floor.id, room.cx, room.cy);
            setHoveredRoom(null);
          }}
          onSetAsRescuer={() => {
            const room = floor.rooms.find(r => r.id === hoveredRoom)!;
            startPlacingRescuer();
            placeRescueMarker(subMap.id, floor.id, room.cx, room.cy);
            setHoveredRoom(null);
          }}
        />
      )}

      {/* Rescue placement hint */}
      {isRescueMode && rescuePlacingFor && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className={`px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm ${
            rescuePlacingFor === 'rescuer'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-red-500/20 border-red-500/40 text-red-300'
          }`}>
            {rescuePlacingFor === 'rescuer' ? '🔥 Click to place Rescuer (Firefighter)' : '🆘 Click to place Rescuee (Person Trapped)'}
          </div>
        </div>
      )}

      {/* Pin placement hint */}
      {pinMode && !pendingPinPos && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm bg-indigo-500/20 border-indigo-500/40 text-indigo-300">
            📍 Click to place a location pin
          </div>
        </div>
      )}

      {/* Zone mode hint */}
      {zoneMode && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm bg-red-600/20 border-red-600/40 text-red-300">
            ⛔ Drag to draw a blocked zone · Click zone to remove
          </div>
        </div>
      )}

      {/* 3D pin mode hint */}
      {model3dMode && !pending3DPinPos && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="px-4 py-2 rounded-xl text-sm font-medium border backdrop-blur-sm bg-cyan-500/20 border-cyan-500/40 text-cyan-300">
            🧊 Click to place a 3D model pin
          </div>
        </div>
      )}

      {/* 3D upload popover */}
      {pending3DPinPos && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
          <Model3DUploadPopover
            defaultLabel={`3D Point ${floor.rooms.filter(r => r.model3D).length + 1}`}
            onCancel={() => setPending3DPinPos(null)}
            onUpload={(asset) => {
              const room: RoomAnnotation = {
                id: crypto.randomUUID(),
                label: asset.label || `3D Point ${floor.rooms.filter(r => r.model3D).length + 1}`,
                cx: pending3DPinPos.x,
                cy: pending3DPinPos.y,
                model3D: asset,
              };
              addRoom(subMap.id, floor.id, room);
              persistProject();
              setPending3DPinPos(null);
              setModel3dMode(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────

function WalkabilityOverlay({ grid }: { grid: ReturnType<typeof processFloorPlanImage> }) {
  const { rows, cols } = grid;
  const cellW = 100 / cols;
  const cellH = 100 / rows;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.45 }}>
      {grid.grid.map((row, ri) =>
        row.map((walkable, ci) => (
          walkable ? null : (
            <div
              key={`${ri}_${ci}`}
              className="absolute"
              style={{
                left: `${ci * cellW}%`,
                top: `${ri * cellH}%`,
                width: `${cellW + 0.1}%`,
                height: `${cellH + 0.1}%`,
                background: 'rgba(239,68,68,0.5)',
              }}
            />
          )
        ))
      )}
    </div>
  );
}

function ElementOverlay({
  outline,
  width,
  height,
}: {
  outline: import('@/lib/types').EnhancedFloorPlanOutline;
  width: number;
  height: number;
}) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="hatch-outdoor" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(34,197,94,0.4)" strokeWidth="2" />
        </pattern>
        <pattern id="hatch-restricted" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(239,68,68,0.5)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Walls */}
      {outline.walls.map((w, i) => (
        <line
          key={`w_${i}`}
          x1={w.x1 * width} y1={w.y1 * height}
          x2={w.x2 * width} y2={w.y2 * height}
          stroke="rgba(30,41,59,0.8)"
          strokeWidth={w.thickness ?? 3}
          strokeLinecap="square"
        />
      ))}

      {/* Windows — dashed cyan */}
      {outline.windows.map((wn, i) => (
        <line
          key={`wn_${i}`}
          x1={wn.x1 * width} y1={wn.y1 * height}
          x2={wn.x2 * width} y2={wn.y2 * height}
          stroke="rgba(96,165,250,0.7)"
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      ))}

      {/* Doors — amber arc indicator */}
      {outline.doors.map((d, i) => (
        <circle
          key={`d_${i}`}
          cx={d.x * width} cy={d.y * height}
          r={5}
          fill="rgba(245,158,11,0.5)"
          stroke="rgba(245,158,11,0.8)"
          strokeWidth={1.5}
        />
      ))}

      {/* Balconies — green hatch */}
      {outline.balconies.map((b, i) => (
        <polygon
          key={`b_${i}`}
          points={b.polygon.map(p => `${p.x * width},${p.y * height}`).join(' ')}
          fill="url(#hatch-outdoor)"
          stroke="rgba(34,197,94,0.5)"
          strokeWidth={1.5}
        />
      ))}

      {/* Restricted zones — red hatch */}
      {outline.restrictedZones.map((rz, i) => (
        <polygon
          key={`rz_${i}`}
          points={rz.polygon.map(p => `${p.x * width},${p.y * height}`).join(' ')}
          fill="rgba(239,68,68,0.2)"
          stroke="rgba(239,68,68,0.5)"
          strokeWidth={1.5}
        />
      ))}

      {/* Stairs — diagonal stripes */}
      {outline.stairs.map((s, i) => (
        <polygon
          key={`s_${i}`}
          points={s.polygon.map(p => `${p.x * width},${p.y * height}`).join(' ')}
          fill="rgba(139,92,246,0.15)"
          stroke="rgba(139,92,246,0.5)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

function RescueMarker({
  x, y, color, label, icon,
}: { x: number; y: number; color: string; label: string; icon: string }) {
  return (
    <g>
      {/* Animated outer ring */}
      <circle cx={x} cy={y} r={20} fill="none" stroke={color} strokeWidth={1.5} opacity={0.4}>
        <animate attributeName="r" from="14" to="26" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" from="0.6" to="0" dur="1.5s" repeatCount="indefinite" />
      </circle>

      {/* Inner circle */}
      <circle cx={x} cy={y} r={13} fill={`${color}25`} stroke={color} strokeWidth={2} />

      {/* Icon */}
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={10} style={{ userSelect: 'none' }}>
        {icon}
      </text>

      {/* Label */}
      <rect x={x - 25} y={y - 26} width={50} height={13} rx={3} fill="rgba(10,13,20,0.85)" />
      <text x={x} y={y - 20} textAnchor="middle" dominantBaseline="middle" fontSize={7.5} fill={color} style={{ userSelect: 'none' }}>
        {label}
      </text>
    </g>
  );
}

/** Animated firefighter marker that moves along the rescue route during simulation */
function SimulationMarker({ x, y, isPlaying }: { x: number; y: number; isPlaying: boolean }) {
  return (
    <g>
      {/* Pulsing outer ring when playing */}
      {isPlaying && (
        <circle cx={x} cy={y} r={20} fill="none" stroke="#06b6d4" strokeWidth={2} opacity={0.5}>
          <animate attributeName="r" from="16" to="30" dur="0.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0" dur="0.8s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Trail glow */}
      <circle cx={x} cy={y} r={18} fill="rgba(6,182,212,0.1)" />

      {/* Main body */}
      <circle cx={x} cy={y} r={14} fill="rgba(6,182,212,0.2)" stroke="#06b6d4" strokeWidth={2.5} />

      {/* Firefighter icon */}
      <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fontSize={12} style={{ userSelect: 'none' }}>
        🔥
      </text>

      {/* Label */}
      <rect x={x - 30} y={y - 28} width={60} height={14} rx={4} fill="rgba(6,182,212,0.9)" />
      <text x={x} y={y - 21} textAnchor="middle" dominantBaseline="middle" fontSize={7} fill="white" fontWeight="bold" style={{ userSelect: 'none' }}>
        {isPlaying ? 'EN ROUTE' : 'PAUSED'}
      </text>
    </g>
  );
}
