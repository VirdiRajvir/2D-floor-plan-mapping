'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useMapStore } from '@/store/mapStore';
import { FloorPlan, Transition, PathPoint } from '@/lib/types';

const ROOM_WIDTH = 320;
const ROOM_HEIGHT = 220;
const CORRIDOR_WIDTH = 100;
const PADDING = 40;

interface RoomPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  plan: FloorPlan;
}

function calculateLayout(
  orderedPlans: FloorPlan[],
  transitions: Transition[]
): { rooms: RoomPosition[]; gaps: GapPosition[]; connections: ConnectionPosition[] } {
  const rooms: RoomPosition[] = [];
  const gaps: GapPosition[] = [];

  let currentX = PADDING;
  const centerY = 300;

  // First pass: position rooms using manual positions or auto-layout
  for (let i = 0; i < orderedPlans.length; i++) {
    const plan = orderedPlans[i];
    
    let roomX: number;
    let roomY: number;
    
    if (plan.position) {
      // Use manual position if set
      roomX = plan.position.x;
      roomY = plan.position.y;
    } else {
      // Auto-layout for rooms without manual position
      roomX = currentX;
      roomY = centerY - ROOM_HEIGHT / 2;
    }
    
    const roomPos: RoomPosition = {
      x: roomX,
      y: roomY,
      width: ROOM_WIDTH,
      height: ROOM_HEIGHT,
      plan,
    };
    rooms.push(roomPos);

    // Only add gaps and advance position for auto-layout rooms
    if (!plan.position && i < orderedPlans.length - 1) {
      gaps.push({
        x: currentX + ROOM_WIDTH,
        y: centerY - ROOM_HEIGHT / 2,
        width: CORRIDOR_WIDTH,
        height: ROOM_HEIGHT,
      });
      currentX += ROOM_WIDTH + CORRIDOR_WIDTH;
    } else if (!plan.position) {
      // This is the last room in auto-layout
    } else {
      // Manual position: still advance for next auto-layout room
      if (i < orderedPlans.length - 1 && !orderedPlans[i + 1].position) {
        currentX += ROOM_WIDTH + CORRIDOR_WIDTH;
      }
    }
  }

  const roomById = new Map(rooms.map((r) => [r.plan.id, r]));
  const pairCounts = new Map<string, number>();

  transitions.forEach((t) => {
    const key = `${t.fromRoomId}->${t.toRoomId}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  });

  const pairSeen = new Map<string, number>();
  const connections: ConnectionPosition[] = transitions
    .map((t) => {
      const fromRoomPos = roomById.get(t.fromRoomId);
      const toRoomPos = roomById.get(t.toRoomId);
      if (!fromRoomPos || !toRoomPos) return null;

      const key = `${t.fromRoomId}->${t.toRoomId}`;
      const seen = pairSeen.get(key) ?? 0;
      pairSeen.set(key, seen + 1);

      return {
        transition: t,
        fromRoom: fromRoomPos.plan,
        toRoom: toRoomPos.plan,
        fromRoomPos,
        toRoomPos,
        pairIndex: seen,
        pairCount: pairCounts.get(key) ?? 1,
      };
    })
    .filter((c): c is ConnectionPosition => c !== null);

  return { rooms, gaps, connections };
}

interface GapPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ConnectionPosition {
  transition: Transition;
  fromRoom: FloorPlan;
  toRoom: FloorPlan;
  fromRoomPos: RoomPosition;
  toRoomPos: RoomPosition;
  pairIndex: number;
  pairCount: number;
}

function getMarkerSVGPosition(
  roomPos: RoomPosition,
  marker: { x: number; y: number } | undefined,
  side: 'right' | 'left'
): { x: number; y: number } {
  const imgX = roomPos.x + IMG_PAD;
  const imgY = roomPos.y + IMG_PAD;
  const imgW = roomPos.width - IMG_PAD * 2;
  const imgH = roomPos.height - IMG_PAD * 2;
  if (marker) {
    return {
      x: imgX + (imgW * marker.x) / 100,
      y: imgY + (imgH * marker.y) / 100,
    };
  }
  // Default: center of left/right edge
  return {
    x: side === 'right' ? roomPos.x + roomPos.width : roomPos.x,
    y: roomPos.y + roomPos.height / 2,
  };
}

function rigidTransform(
  pathPoints: PathPoint[],
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number }[] {
  if (pathPoints.length < 2) return [start, end];

  const first = pathPoints[0];
  const last = pathPoints[pathPoints.length - 1];

  const origDx = last.x - first.x;
  const origDy = last.y - first.y;
  const origLen = Math.sqrt(origDx * origDx + origDy * origDy) || 1;
  const origAngle = Math.atan2(origDy, origDx);

  const targetDx = end.x - start.x;
  const targetDy = end.y - start.y;
  const targetLen = Math.sqrt(targetDx * targetDx + targetDy * targetDy) || 1;
  const targetAngle = Math.atan2(targetDy, targetDx);

  const scale = targetLen / origLen;
  const rotation = targetAngle - origAngle;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  return pathPoints.map((p) => {
    const dx = p.x - first.x;
    const dy = p.y - first.y;
    const rx = (dx * cosR - dy * sinR) * scale;
    const ry = (dx * sinR + dy * cosR) * scale;
    return { x: start.x + rx, y: start.y + ry };
  });
}

function pointInRect(
  p: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return p.x > rect.x && p.x < rect.x + rect.width && p.y > rect.y && p.y < rect.y + rect.height;
}

function mirrorAcrossLine(
  points: { x: number; y: number }[],
  a: { x: number; y: number },
  b: { x: number; y: number }
): { x: number; y: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy || 1;
  return points.map((p) => {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return { x: 2 * projX - p.x, y: 2 * projY - p.y };
  });
}

function remapPathBetweenPoints(
  pathPoints: PathPoint[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  fromRect: RoomPosition,
  toRect: RoomPosition
): { x: number; y: number }[] {
  const mapped = rigidTransform(pathPoints, start, end);

  // Count how many interior points (skip first/last which are on the markers) overlap rooms
  const interior = mapped.slice(1, -1);
  const overlapCount = interior.filter(
    (p) => pointInRect(p, fromRect) || pointInRect(p, toRect)
  ).length;

  if (overlapCount > interior.length * 0.2) {
    // Mirror the path across the start→end line so it arcs the other way
    return mirrorAcrossLine(mapped, start, end);
  }

  return mapped;
}

// --- Walkable region helpers ---

interface WalkableRegion {
  rects: { x: number; y: number; w: number; h: number }[];
  pathSegments: { x1: number; y1: number; x2: number; y2: number }[];
}

const PATH_CORRIDOR_HALF_WIDTH = 8; // how thick the walkable corridor around path lines is

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

function isInsideWalkable(x: number, y: number, region: WalkableRegion): boolean {
  // Check rects
  for (const r of region.rects) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  // Check path segments (within corridor width)
  for (const seg of region.pathSegments) {
    if (distToSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2) <= PATH_CORRIDOR_HALF_WIDTH) {
      return true;
    }
  }
  return false;
}

function closestWalkablePoint(
  x: number,
  y: number,
  region: WalkableRegion
): { x: number; y: number } {
  // Already inside
  if (isInsideWalkable(x, y, region)) return { x, y };

  let bestX = x;
  let bestY = y;
  let bestDist = Infinity;

  // Clamp to closest rect edge
  for (const r of region.rects) {
    const cx = Math.max(r.x, Math.min(r.x + r.w, x));
    const cy = Math.max(r.y, Math.min(r.y + r.h, y));
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestX = cx;
      bestY = cy;
    }
  }

  // Clamp to closest point on path segments
  for (const seg of region.pathSegments) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((x - seg.x1) * dx + (y - seg.y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = seg.x1 + t * dx;
    const projY = seg.y1 + t * dy;
    const d = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);
    if (d < bestDist) {
      bestDist = d;
      bestX = projX;
      bestY = projY;
    }
  }

  return { x: bestX, y: bestY };
}

const IMG_PAD = 2;

function RoomCard({ room, isSelected, onClick }: { room: RoomPosition; isSelected: boolean; onClick: () => void }) {
  const imgX = room.x + IMG_PAD;
  const imgY = room.y + IMG_PAD;
  const imgW = room.width - IMG_PAD * 2;
  const imgH = room.height - IMG_PAD * 2;

  return (
    <g onClick={onClick} className="cursor-pointer">
      {/* Subtle outer glow when selected */}
      {isSelected && (
        <rect
          x={room.x - 3}
          y={room.y - 3}
          width={room.width + 6}
          height={room.height + 6}
          rx={4}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}

      {/* Thin border matching floor-plan line style */}
      <rect
        x={room.x}
        y={room.y}
        width={room.width}
        height={room.height}
        rx={2}
        fill="#f8f8f8"
        stroke="#333"
        strokeWidth={1.2}
      />

      {/* Floor plan image — fills almost the entire card */}
      <clipPath id={`clip-${room.plan.id}`}>
        <rect x={imgX} y={imgY} width={imgW} height={imgH} rx={1} />
      </clipPath>
      <image
        href={room.plan.imageUrl}
        x={imgX}
        y={imgY}
        width={imgW}
        height={imgH}
        clipPath={`url(#clip-${room.plan.id})`}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Room label — small tag below image */}
      <rect
        x={room.x + room.width / 2 - 40}
        y={room.y + room.height + 4}
        width={80}
        height={20}
        rx={3}
        fill="#1a1a1a"
        opacity={0.85}
      />
      <text
        x={room.x + room.width / 2}
        y={room.y + room.height + 17}
        textAnchor="middle"
        fill="#e5e5e5"
        fontSize={11}
        fontWeight={600}
        fontFamily="system-ui"
      >
        {room.plan.name}
      </text>

      {/* Exit point — small red marker */}
      {room.plan.exitPoint && (
        <g>
          <circle
            cx={imgX + (imgW * room.plan.exitPoint.x) / 100}
            cy={imgY + (imgH * room.plan.exitPoint.y) / 100}
            r={5}
            fill="#dc2626"
            stroke="#1a1a1a"
            strokeWidth={1.5}
          />
        </g>
      )}

      {/* Entry point — small green marker */}
      {room.plan.entryPoint && (
        <g>
          <circle
            cx={imgX + (imgW * room.plan.entryPoint.x) / 100}
            cy={imgY + (imgH * room.plan.entryPoint.y) / 100}
            r={5}
            fill="#16a34a"
            stroke="#1a1a1a"
            strokeWidth={1.5}
          />
        </g>
      )}
    </g>
  );
}

function GapBackground({ gap }: { gap: GapPosition }) {
  return (
    <rect
      x={gap.x}
      y={gap.y}
      width={gap.width}
      height={gap.height}
      fill="#0d1117"
      opacity={0.6}
    />
  );
}

function applyConnectionOffset(
  points: { x: number; y: number }[],
  pairIndex: number,
  pairCount: number
): { x: number; y: number }[] {
  if (pairCount <= 1) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const center = (pairCount - 1) / 2;
  const amount = (pairIndex - center) * 14;
  return points.map((p) => ({ x: p.x + nx * amount, y: p.y + ny * amount }));
}

function ConnectorPath({ connection }: { connection: ConnectionPosition }) {
  const transition = connection.transition;
  const hasPath = transition.path && transition.path.points.length > 1;

  const exitMarker = getMarkerSVGPosition(connection.fromRoomPos, connection.fromRoom.exitPoint ?? undefined, 'right');
  const entryMarker = getMarkerSVGPosition(connection.toRoomPos, connection.toRoom.entryPoint ?? undefined, 'left');

  if (hasPath && transition.path) {
    const mapped = applyConnectionOffset(
      remapPathBetweenPoints(
        transition.path.points,
        exitMarker,
        entryMarker,
        connection.fromRoomPos,
        connection.toRoomPos
      ),
      connection.pairIndex,
      connection.pairCount
    );

    const pathData = mapped
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');

    // Evenly spaced arrow indices
    const arrowCount = 4;
    const arrowIndices: number[] = [];
    for (let a = 1; a <= arrowCount; a++) {
      arrowIndices.push(Math.round((a / (arrowCount + 1)) * (mapped.length - 1)));
    }

    return (
      <g>
        {/* Path outline — dark stroke matching floor plan line weight */}
        <path
          d={pathData}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Path fill — colored core */}
        <path
          d={pathData}
          fill="none"
          stroke="#dc2626"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw-path"
        />

        {/* Direction arrows along path — architectural style */}
        {arrowIndices.map((idx, i) => {
          const p = mapped[idx];
          const prev = mapped[Math.max(0, idx - 1)];
          const angle = Math.atan2(p.y - prev.y, p.x - prev.x) * (180 / Math.PI);
          return (
            <g key={i} transform={`translate(${p.x}, ${p.y}) rotate(${angle})`}>
              <polygon points="-4,-4 5,0 -4,4" fill="#1a1a1a" />
              <polygon points="-3,-3 4,0 -3,3" fill="#dc2626" />
            </g>
          );
        })}

        {/* Distance label — subtle inline tag */}
        <rect
          x={(exitMarker.x + entryMarker.x) / 2 - 28}
          y={Math.max(exitMarker.y, entryMarker.y) + 8}
          width={56}
          height={18}
          rx={3}
          fill="#1a1a1a"
          opacity={0.85}
        />
        <text
          x={(exitMarker.x + entryMarker.x) / 2}
          y={Math.max(exitMarker.y, entryMarker.y) + 20}
          textAnchor="middle"
          fill="#e5e5e5"
          fontSize={10}
          fontWeight={600}
          fontFamily="monospace"
        >
          {transition.path?.totalDistance}m
        </text>
      </g>
    );
  }

  // No path data - show thin dashed connector
  return (
    <g>
      <line
        x1={exitMarker.x}
        y1={exitMarker.y}
        x2={entryMarker.x}
        y2={entryMarker.y}
        stroke="#555"
        strokeWidth={1.2}
        strokeDasharray="6 4"
      />
      <polygon
        points={`${entryMarker.x - 7},${entryMarker.y - 3} ${entryMarker.x},${entryMarker.y} ${entryMarker.x - 7},${entryMarker.y + 3}`}
        fill="#555"
      />
      <text
        x={(exitMarker.x + entryMarker.x) / 2}
        y={Math.min(exitMarker.y, entryMarker.y) - 8}
        textAnchor="middle"
        fill="#888"
        fontSize={9}
        fontFamily="system-ui"
      >
        No data
      </text>
    </g>
  );
}

export default function InteractiveMap() {
  const { floorPlans, transitions, getOrderedFloorPlans, selectedFloorPlanId, selectFloorPlan, setFloorPlanPosition } = useMapStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // --- Room dragging state ---
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const ordered = getOrderedFloorPlans();
  const { rooms, gaps, connections } = calculateLayout(ordered, transitions);

  // --- Player dot state ---
  const [playerPos, setPlayerPos] = useState<{ x: number; y: number } | null>(null);
  const keysDown = useRef<Set<string>>(new Set());
  const PLAYER_SPEED = 3;

  // Build walkable region from rooms + connection paths
  const walkableRegion = useMemo<WalkableRegion>(() => {
    const rects = rooms.map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));
    const pathSegments: WalkableRegion['pathSegments'] = [];

    for (const connection of connections) {
      const t = connection.transition;
      const exitMarker = getMarkerSVGPosition(
        connection.fromRoomPos,
        connection.fromRoom.exitPoint ?? undefined,
        'right'
      );
      const entryMarker = getMarkerSVGPosition(
        connection.toRoomPos,
        connection.toRoom.entryPoint ?? undefined,
        'left'
      );

      if (t.path && t.path.points.length > 1) {
        const mapped = applyConnectionOffset(
          remapPathBetweenPoints(
            t.path.points,
            exitMarker,
            entryMarker,
            connection.fromRoomPos,
            connection.toRoomPos
          ),
          connection.pairIndex,
          connection.pairCount
        );

        for (let i = 0; i < mapped.length - 1; i++) {
          pathSegments.push({
            x1: mapped[i].x,
            y1: mapped[i].y,
            x2: mapped[i + 1].x,
            y2: mapped[i + 1].y,
          });
        }
      } else {
        pathSegments.push({
          x1: exitMarker.x,
          y1: exitMarker.y,
          x2: entryMarker.x,
          y2: entryMarker.y,
        });
      }
    }

    return { rects, pathSegments };
  }, [rooms, connections]);

  // Initialize player position to center of first room
  useEffect(() => {
    if (rooms.length > 0 && playerPos === null) {
      setPlayerPos({
        x: rooms[0].x + rooms[0].width / 2,
        y: rooms[0].y + rooms[0].height / 2,
      });
    }
  }, [rooms, playerPos]);

  // WASD key handling
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(k)) {
        e.preventDefault();
        keysDown.current.add(k);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Movement loop
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const keys = keysDown.current;
      if (keys.size > 0 && playerPos) {
        let dx = 0;
        let dy = 0;
        if (keys.has('w')) dy -= 1;
        if (keys.has('s')) dy += 1;
        if (keys.has('a')) dx -= 1;
        if (keys.has('d')) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const len = Math.sqrt(dx * dx + dy * dy);
          dx = (dx / len) * PLAYER_SPEED;
          dy = (dy / len) * PLAYER_SPEED;
          const desired = { x: playerPos.x + dx, y: playerPos.y + dy };
          const clamped = closestWalkablePoint(desired.x, desired.y, walkableRegion);
          setPlayerPos(clamped);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playerPos, walkableRegion]);

  // Calculate total map width
  const totalWidth = rooms.length > 0
    ? rooms[rooms.length - 1].x + ROOM_WIDTH + PADDING
    : 1200;

  useEffect(() => {
    setViewBox({ x: 0, y: 100, w: Math.max(totalWidth, 800), h: 500 });
  }, [totalWidth]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.3, Math.min(3, zoom * delta));
      setZoom(newZoom);
      setViewBox((v) => ({
        ...v,
        w: (totalWidth / newZoom) * 1,
        h: (500 / newZoom) * 1,
      }));
    },
    [zoom, totalWidth]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !draggedRoomId) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedRoomId) {
      // Handle room dragging
      const svg = svgRef.current;
      if (!svg) return;
      
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      
      const newX = svgP.x - dragOffset.x;
      const newY = svgP.y - dragOffset.y;
      
      setFloorPlanPosition(draggedRoomId, newX, newY);
      return;
    }
    
    if (!isPanning) return;
    const dx = (e.clientX - panStart.x) / zoom;
    const dy = (e.clientY - panStart.y) / zoom;
    setViewBox((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedRoomId(null);
  };

  const handleRoomDragStart = useCallback((roomId: string, roomX: number, roomY: number, clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    
    setDraggedRoomId(roomId);
    setDragOffset({
      x: svgP.x - roomX,
      y: svgP.y - roomY,
    });
  }, []);

  const resetView = () => {
    setZoom(1);
    setViewBox({ x: 0, y: 100, w: Math.max(totalWidth, 800), h: 500 });
  };

  if (ordered.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Upload floor plans and configure transitions to see the map.</p>
      </div>
    );
  }

  // Calculate safety stats
  const totalDistance = transitions.reduce((sum, t) => sum + (t.path?.totalDistance || 0), 0);
  const processedCount = transitions.filter((t) => t.processed).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Safety Monitoring Map</h2>
          <p className="text-gray-400 text-sm">Interactive facility overview with evacuation paths</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={resetView}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors"
          >
            Reset View
          </button>
          <div className="text-sm text-gray-400">
            Zoom: {Math.round(zoom * 100)}%
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-400">{ordered.length}</p>
          <p className="text-xs text-gray-500 mt-1">Rooms</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-400">{processedCount}/{transitions.length}</p>
          <p className="text-xs text-gray-500 mt-1">Paths Mapped</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-yellow-400">{totalDistance.toFixed(1)}m</p>
          <p className="text-xs text-gray-500 mt-1">Total Path Length</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold ${processedCount === transitions.length && transitions.length > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {processedCount === transitions.length && transitions.length > 0 ? 'MAPPED' : 'PARTIAL'}
          </p>
          <p className="text-xs text-gray-500 mt-1">Coverage Status</p>
        </div>
      </div>

      {/* Map canvas */}
      <div
        ref={containerRef}
        className="bg-[#0d1117] rounded-xl border border-gray-800/40 overflow-hidden"
        style={{ height: '500px' }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={isPanning ? 'cursor-grabbing' : 'cursor-grab'}
        >
          {/* Subtle dot grid background */}
          <defs>
            <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.5" fill="#333" />
            </pattern>
            <style>{`
              @keyframes drawPath {
                from { stroke-dashoffset: 1000; }
                to { stroke-dashoffset: 0; }
              }
              .animate-draw-path {
                stroke-dasharray: 1000;
                animation: drawPath 2s ease-out forwards;
              }
            `}</style>
          </defs>
          <rect x={viewBox.x - 1000} y={viewBox.y - 1000} width={viewBox.w + 2000} height={viewBox.h + 2000} fill="#0d1117" />
          <rect x={viewBox.x - 1000} y={viewBox.y - 1000} width={viewBox.w + 2000} height={viewBox.h + 2000} fill="url(#dotgrid)" />

          {/* Gap backgrounds (behind rooms) */}
          {gaps.map((gap, i) => (
            <GapBackground key={`bg-${i}`} gap={gap} />
          ))}

          {/* Rooms */}
          {rooms.map((room) => (
            <RoomCard
              key={room.plan.id}
              room={room}
              isSelected={selectedFloorPlanId === room.plan.id}
              onClick={() => selectFloorPlan(room.plan.id)}
            />
          ))}

          {/* Connector paths for all graph connections */}
          {connections.map((connection, i) => (
            <ConnectorPath key={`path-${connection.transition.id}-${i}`} connection={connection} />
          ))}

          {/* Player dot */}
          {playerPos && (
            <g>
              {/* Outer glow */}
              <circle cx={playerPos.x} cy={playerPos.y} r={10} fill="#facc15" opacity={0.2} />
              {/* Dot */}
              <circle cx={playerPos.x} cy={playerPos.y} r={6} fill="#facc15" stroke="#1a1a1a" strokeWidth={2} />
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 justify-center text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
          <span>Exit</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
          <span>Entry</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 bg-red-600" />
          <span>Path</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-0.5 border-t border-dashed border-gray-500" />
          <span>Unmapped</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <span>Player</span>
        </div>
        <div className="flex items-center gap-1.5 ml-2 text-gray-600">
          <kbd className="px-1 py-0.5 bg-gray-800 rounded text-[10px] font-mono">WASD</kbd>
          <span>to move</span>
        </div>
      </div>
    </div>
  );
}
