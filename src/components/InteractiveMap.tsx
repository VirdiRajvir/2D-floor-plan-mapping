'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';
import { normalizePathToBox } from '@/lib/pathCalculator';
import { FloorPlan, Transition, PathPoint } from '@/lib/types';

const ROOM_WIDTH = 280;
const ROOM_HEIGHT = 200;
const CORRIDOR_WIDTH = 160;
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
): { rooms: RoomPosition[]; corridors: CorridorPosition[] } {
  const rooms: RoomPosition[] = [];
  const corridors: CorridorPosition[] = [];

  let currentX = PADDING;
  const centerY = 300;

  for (let i = 0; i < orderedPlans.length; i++) {
    const plan = orderedPlans[i];
    rooms.push({
      x: currentX,
      y: centerY - ROOM_HEIGHT / 2,
      width: ROOM_WIDTH,
      height: ROOM_HEIGHT,
      plan,
    });

    if (i < orderedPlans.length - 1) {
      const transition = transitions.find(
        (t) => t.fromRoomId === plan.id && t.toRoomId === orderedPlans[i + 1].id
      );

      const corridorX = currentX + ROOM_WIDTH;
      corridors.push({
        x: corridorX,
        y: centerY - 40,
        width: CORRIDOR_WIDTH,
        height: 80,
        transition: transition || null,
        fromRoom: plan,
        toRoom: orderedPlans[i + 1],
      });

      currentX += ROOM_WIDTH + CORRIDOR_WIDTH;
    }
  }

  return { rooms, corridors };
}

interface CorridorPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  transition: Transition | null;
  fromRoom: FloorPlan;
  toRoom: FloorPlan;
}

function RoomCard({ room, isSelected, onClick }: { room: RoomPosition; isSelected: boolean; onClick: () => void }) {
  return (
    <g onClick={onClick} className="cursor-pointer">
      {/* Room background */}
      <rect
        x={room.x}
        y={room.y}
        width={room.width}
        height={room.height}
        rx={12}
        fill="#1f2937"
        stroke={isSelected ? '#3b82f6' : '#374151'}
        strokeWidth={isSelected ? 3 : 1.5}
        className="transition-all"
      />

      {/* Floor plan image */}
      <clipPath id={`clip-${room.plan.id}`}>
        <rect x={room.x + 4} y={room.y + 4} width={room.width - 8} height={room.height - 36} rx={8} />
      </clipPath>
      <image
        href={room.plan.imageUrl}
        x={room.x + 4}
        y={room.y + 4}
        width={room.width - 8}
        height={room.height - 36}
        clipPath={`url(#clip-${room.plan.id})`}
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Room name */}
      <rect x={room.x} y={room.y + room.height - 32} width={room.width} height={32} rx={0} fill="#111827" opacity={0.9} />
      <rect x={room.x} y={room.y + room.height - 1} width={room.width} height={1} rx={0} fill="transparent" />
      <text
        x={room.x + room.width / 2}
        y={room.y + room.height - 12}
        textAnchor="middle"
        fill="white"
        fontSize={13}
        fontWeight={600}
        fontFamily="system-ui"
      >
        {room.plan.name}
      </text>

      {/* Order badge */}
      <circle cx={room.x + 20} cy={room.y + 20} r={14} fill="#2563eb" />
      <text
        x={room.x + 20}
        y={room.y + 25}
        textAnchor="middle"
        fill="white"
        fontSize={12}
        fontWeight={700}
        fontFamily="system-ui"
      >
        {room.plan.order + 1}
      </text>

      {/* Exit point */}
      {room.plan.exitPoint && (
        <g>
          <circle
            cx={room.x + 4 + ((room.width - 8) * room.plan.exitPoint.x) / 100}
            cy={room.y + 4 + ((room.height - 36) * room.plan.exitPoint.y) / 100}
            r={6}
            fill="#ef4444"
            stroke="white"
            strokeWidth={2}
          />
        </g>
      )}

      {/* Entry point */}
      {room.plan.entryPoint && (
        <g>
          <circle
            cx={room.x + 4 + ((room.width - 8) * room.plan.entryPoint.x) / 100}
            cy={room.y + 4 + ((room.height - 36) * room.plan.entryPoint.y) / 100}
            r={6}
            fill="#22c55e"
            stroke="white"
            strokeWidth={2}
          />
        </g>
      )}
    </g>
  );
}

function CorridorPath({ corridor }: { corridor: CorridorPosition }) {
  const transition = corridor.transition;
  const hasPath = transition?.path && transition.path.points.length > 1;

  if (hasPath && transition?.path) {
    const normalized = normalizePathToBox(
      transition.path.points,
      corridor.width,
      corridor.height,
      10
    );

    const pathData = normalized
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${corridor.x + p.x} ${corridor.y + p.y}`)
      .join(' ');

    return (
      <g>
        {/* Corridor background */}
        <rect
          x={corridor.x}
          y={corridor.y}
          width={corridor.width}
          height={corridor.height}
          rx={8}
          fill="#0f172a"
          stroke="#1e3a5f"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Animated path */}
        <path
          d={pathData}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw-path"
        />

        {/* Path glow */}
        <path
          d={pathData}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={8}
          strokeLinecap="round"
          opacity={0.15}
        />

        {/* Direction arrows along path */}
        {normalized.filter((_, i) => i % Math.max(1, Math.floor(normalized.length / 3)) === 0 && i > 0).map((p, i) => {
          const prev = normalized[Math.max(0, normalized.indexOf(p) - 1)];
          const angle = Math.atan2(p.y - prev.y, p.x - prev.x) * (180 / Math.PI);
          return (
            <g key={i} transform={`translate(${corridor.x + p.x}, ${corridor.y + p.y}) rotate(${angle})`}>
              <polygon points="0,-3 6,0 0,3" fill="#60a5fa" />
            </g>
          );
        })}

        {/* Distance label */}
        <rect
          x={corridor.x + corridor.width / 2 - 30}
          y={corridor.y + corridor.height + 4}
          width={60}
          height={22}
          rx={4}
          fill="#1e3a5f"
        />
        <text
          x={corridor.x + corridor.width / 2}
          y={corridor.y + corridor.height + 19}
          textAnchor="middle"
          fill="#93c5fd"
          fontSize={11}
          fontWeight={600}
          fontFamily="monospace"
        >
          {transition.path?.totalDistance}m
        </text>
      </g>
    );
  }

  // No path data - show dashed connector  
  return (
    <g>
      <rect
        x={corridor.x}
        y={corridor.y}
        width={corridor.width}
        height={corridor.height}
        rx={8}
        fill="#0a0a0a"
        stroke="#374151"
        strokeWidth={1}
        strokeDasharray="6 4"
      />
      <line
        x1={corridor.x + 10}
        y1={corridor.y + corridor.height / 2}
        x2={corridor.x + corridor.width - 10}
        y2={corridor.y + corridor.height / 2}
        stroke="#4b5563"
        strokeWidth={2}
        strokeDasharray="8 6"
      />
      <polygon
        points={`${corridor.x + corridor.width - 15},${corridor.y + corridor.height / 2 - 5} ${corridor.x + corridor.width - 5},${corridor.y + corridor.height / 2} ${corridor.x + corridor.width - 15},${corridor.y + corridor.height / 2 + 5}`}
        fill="#4b5563"
      />
      <text
        x={corridor.x + corridor.width / 2}
        y={corridor.y + corridor.height / 2 - 10}
        textAnchor="middle"
        fill="#6b7280"
        fontSize={10}
        fontFamily="system-ui"
      >
        No data
      </text>
    </g>
  );
}

export default function InteractiveMap() {
  const { floorPlans, transitions, getOrderedFloorPlans, selectedFloorPlanId, selectFloorPlan } = useMapStore();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 600 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const ordered = getOrderedFloorPlans();
  const { rooms, corridors } = calculateLayout(ordered, transitions);

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
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = (e.clientX - panStart.x) / zoom;
    const dy = (e.clientY - panStart.y) / zoom;
    setViewBox((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

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
        className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden"
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
          {/* Grid background */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a2e" strokeWidth="0.5" />
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
          <rect x={viewBox.x - 1000} y={viewBox.y - 1000} width={viewBox.w + 2000} height={viewBox.h + 2000} fill="url(#grid)" />

          {/* Title */}
          <text x={PADDING} y={140} fill="#9ca3af" fontSize={14} fontFamily="system-ui">
            FACILITY MAP — {ordered.length} Rooms Connected
          </text>

          {/* Corridors first (behind rooms) */}
          {corridors.map((corridor, i) => (
            <CorridorPath key={i} corridor={corridor} />
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
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 justify-center text-sm text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Exit Point</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Entry Point</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-blue-500" />
          <span>Mapped Path</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 border-t-2 border-dashed border-gray-500" />
          <span>Unmapped</span>
        </div>
      </div>
    </div>
  );
}
