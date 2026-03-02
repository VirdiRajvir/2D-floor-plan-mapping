'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { WalkabilityGrid } from '@/lib/walkabilityGrid';
import { isWalkable, normalizedToGrid, gridToNormalized } from '@/lib/walkabilityGrid';
import { findPath, smoothPath, GridPoint } from '@/lib/pathfinder';
import type { RoomLabel } from '@/lib/imageProcessor';

interface NavigableMapProps {
  imageUrl: string;
  walkGrid: WalkabilityGrid;
  rooms: RoomLabel[];
  onAddRoom?: (room: RoomLabel) => void;
  onRemoveRoom?: (id: string) => void;
}

const PLAYER_SPEED = 1;

export default function NavigableMap({ imageUrl, walkGrid, rooms, onAddRoom, onRemoveRoom }: NavigableMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const overlayRef = useRef<ImageBitmap | null>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [playerPos, setPlayerPos] = useState<GridPoint | null>(null);
  const [destination, setDestination] = useState<GridPoint | null>(null);
  const [currentPath, setCurrentPath] = useState<GridPoint[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 700 });
  const [addingRoom, setAddingRoom] = useState(false);
  const [roomName, setRoomName] = useState('');

  // Zoom & pan
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Movement keys
  const keysDown = useRef<Set<string>>(new Set());

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Generate overlay bitmap from walkGrid
  useEffect(() => {
    const oc = new OffscreenCanvas(walkGrid.cols, walkGrid.rows);
    const octx = oc.getContext('2d')!;

    for (let r = 0; r < walkGrid.rows; r++) {
      for (let c = 0; c < walkGrid.cols; c++) {
        octx.fillStyle = walkGrid.grid[r][c]
          ? 'rgba(34, 197, 94, 0.18)'
          : 'rgba(239, 68, 68, 0.25)';
        octx.fillRect(c, r, 1, 1);
      }
    }

    createImageBitmap(oc).then((bmp) => {
      overlayRef.current = bmp;
    });
  }, [walkGrid]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const img = imageRef.current;
    const aspect = img ? img.naturalWidth / img.naturalHeight : 4 / 3;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setCanvasSize({ width, height: width / aspect });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [imageLoaded]);

  // Keyboard handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
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
  const playerPosRef = useRef(playerPos);
  playerPosRef.current = playerPos;

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const keys = keysDown.current;
      const pos = playerPosRef.current;
      if (keys.size > 0 && pos) {
        let dc = 0, dr = 0;
        if (keys.has('w') || keys.has('arrowup')) dr -= 1;
        if (keys.has('s') || keys.has('arrowdown')) dr += 1;
        if (keys.has('a') || keys.has('arrowleft')) dc -= 1;
        if (keys.has('d') || keys.has('arrowright')) dc += 1;

        if (dc !== 0 || dr !== 0) {
          const newCol = pos.col + dc * PLAYER_SPEED;
          const newRow = pos.row + dr * PLAYER_SPEED;

          if (isWalkable(walkGrid, newCol, newRow)) {
            const newPos = { col: newCol, row: newRow };
            playerPosRef.current = newPos;
            setPlayerPos(newPos);
          } else if (dc !== 0 && isWalkable(walkGrid, pos.col + dc * PLAYER_SPEED, pos.row)) {
            const newPos = { col: pos.col + dc * PLAYER_SPEED, row: pos.row };
            playerPosRef.current = newPos;
            setPlayerPos(newPos);
          } else if (dr !== 0 && isWalkable(walkGrid, pos.col, pos.row + dr * PLAYER_SPEED)) {
            const newPos = { col: pos.col, row: pos.row + dr * PLAYER_SPEED };
            playerPosRef.current = newPos;
            setPlayerPos(newPos);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [walkGrid]);

  // Calculate path when destination changes
  useEffect(() => {
    if (!playerPos || !destination) {
      setCurrentPath([]);
      return;
    }
    const raw = findPath(walkGrid, playerPos, destination);
    const smoothed = smoothPath(walkGrid, raw);
    setCurrentPath(smoothed);
  }, [walkGrid, playerPos, destination]);

  // Convert mouse event to normalized coords
  const mouseToNormalized = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { nx: number; ny: number } | null => {
      if (!canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasSize.width / rect.width;
      const scaleY = canvasSize.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX / zoom - offset.x / zoom;
      const my = (e.clientY - rect.top) * scaleY / zoom - offset.y / zoom;
      return { nx: mx / canvasSize.width, ny: my / canvasSize.height };
    },
    [zoom, offset, canvasSize]
  );

  // Canvas click handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const n = mouseToNormalized(e);
      if (!n) return;

      // Adding room mode
      if (addingRoom && onAddRoom && roomName.trim()) {
        onAddRoom({
          id: crypto.randomUUID(),
          label: roomName.trim(),
          x: n.nx,
          y: n.ny,
        });
        setRoomName('');
        setAddingRoom(false);
        return;
      }

      const gridPt = normalizedToGrid(walkGrid, n.nx, n.ny);
      if (!isWalkable(walkGrid, gridPt.col, gridPt.row)) return;

      if (e.shiftKey) {
        setDestination(gridPt);
      } else {
        setPlayerPos(gridPt);
        playerPosRef.current = gridPt;
        setDestination(null);
        setCurrentPath([]);
      }
    },
    [walkGrid, mouseToNormalized, addingRoom, onAddRoom, roomName]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const n = mouseToNormalized(e);
      if (!n) return;
      const gridPt = normalizedToGrid(walkGrid, n.nx, n.ny);
      if (!isWalkable(walkGrid, gridPt.col, gridPt.row)) return;
      setDestination(gridPt);
    },
    [walkGrid, mouseToNormalized]
  );

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      }
    },
    [offset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setOffset({
          x: panStart.current.ox + (e.clientX - panStart.current.x),
          y: panStart.current.oy + (e.clientY - panStart.current.y),
        });
      }
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.3, Math.min(5, z * delta)));
    },
    []
  );

  // --- Rendering ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvasSize.width;
    const h = canvasSize.height;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // 1. Floor plan image
    ctx.drawImage(img, 0, 0, w, h);

    // 2. Walkability overlay
    if (showOverlay && overlayRef.current) {
      ctx.drawImage(overlayRef.current, 0, 0, w, h);
    }

    // 3. Room labels
    for (const room of rooms) {
      const rx = room.x * w;
      const ry = room.y * h;

      ctx.font = 'bold 11px system-ui';
      const tm = ctx.measureText(room.label);
      const labelW = tm.width + 12;
      const labelH = 20;

      // Background pill
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(rx - labelW / 2, ry - labelH / 2, labelW, labelH, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text
      ctx.fillStyle = '#93c5fd';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(room.label, rx, ry);
    }

    // 4. Pathfinding route
    if (currentPath.length > 1) {
      // Outer dark stroke
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < currentPath.length; i++) {
        const n = gridToNormalized(walkGrid, currentPath[i].col, currentPath[i].row);
        if (i === 0) ctx.moveTo(n.x * w, n.y * h);
        else ctx.lineTo(n.x * w, n.y * h);
      }
      ctx.stroke();

      // Inner blue stroke
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < currentPath.length; i++) {
        const n = gridToNormalized(walkGrid, currentPath[i].col, currentPath[i].row);
        if (i === 0) ctx.moveTo(n.x * w, n.y * h);
        else ctx.lineTo(n.x * w, n.y * h);
      }
      ctx.stroke();

      // Direction arrows
      const arrowSpacing = Math.max(3, Math.floor(currentPath.length / 6));
      for (let i = arrowSpacing; i < currentPath.length; i += arrowSpacing) {
        const n = gridToNormalized(walkGrid, currentPath[i].col, currentPath[i].row);
        const pn = gridToNormalized(walkGrid, currentPath[i - 1].col, currentPath[i - 1].row);
        const ax = n.x * w, ay = n.y * h;
        const angle = Math.atan2(ay - pn.y * h, ax - pn.x * w);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-3, -3);
        ctx.lineTo(-3, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // 5. Destination marker
    if (destination) {
      const dn = gridToNormalized(walkGrid, destination.col, destination.row);
      const dx = dn.x * w, dy = dn.y * h;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dx, dy, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dx - 5, dy); ctx.lineTo(dx + 5, dy);
      ctx.moveTo(dx, dy - 5); ctx.lineTo(dx, dy + 5);
      ctx.stroke();
    }

    // 6. Player dot
    if (playerPos) {
      const pn = gridToNormalized(walkGrid, playerPos.col, playerPos.row);
      const px = pn.x * w, py = pn.y * h;

      const grad = ctx.createRadialGradient(px, py, 0, px, py, 16);
      grad.addColorStop(0, 'rgba(250, 204, 21, 0.4)');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  });

  // Path distance
  const pathDistance = useMemo(() => {
    if (currentPath.length < 2) return null;
    let dist = 0;
    for (let i = 1; i < currentPath.length; i++) {
      const dc = currentPath[i].col - currentPath[i - 1].col;
      const dr = currentPath[i].row - currentPath[i - 1].row;
      dist += Math.sqrt(dc * dc + dr * dr);
    }
    return Math.round(dist * 0.3 * 10) / 10; // ~0.3m per cell
  }, [currentPath]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowOverlay(!showOverlay)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showOverlay
              ? 'bg-green-600/20 text-green-400 border border-green-600/30'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          {showOverlay ? '✓ Walkability' : '○ Walkability'}
        </button>

        <button
          onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
          className="px-4 py-2 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700"
        >
          Reset View
        </button>

        {playerPos && (
          <button
            onClick={() => {
              setPlayerPos(null);
              playerPosRef.current = null;
              setDestination(null);
              setCurrentPath([]);
            }}
            className="px-4 py-2 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700"
          >
            Clear Player
          </button>
        )}

        {/* Add room label control */}
        <div className="flex items-center gap-2">
          {addingRoom ? (
            <>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Room name (e.g., LT 22)"
                className="bg-gray-800 text-white px-3 py-1.5 rounded-lg border border-blue-500/50 text-sm w-44 focus:outline-none focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setAddingRoom(false); setRoomName(''); }
                }}
              />
              <span className="text-xs text-blue-400 animate-pulse">Click on the map to place</span>
              <button
                onClick={() => { setAddingRoom(false); setRoomName(''); }}
                className="px-2 py-1.5 rounded-lg text-sm bg-gray-800 text-gray-400 hover:bg-gray-700"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setAddingRoom(true)}
              className="px-4 py-2 rounded-lg text-sm bg-blue-600/20 text-blue-400 border border-blue-600/30 hover:bg-blue-600/30"
            >
              + Add Room Label
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Info badges */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {rooms.length > 0 && (
            <span className="bg-gray-800 px-3 py-1.5 rounded-lg">
              {rooms.length} rooms
            </span>
          )}
          <span className="bg-gray-800 px-3 py-1.5 rounded-lg">
            {walkGrid.cols}×{walkGrid.rows} grid
          </span>
          {pathDistance !== null && (
            <span className="bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-600/30">
              Path: ~{pathDistance}m
            </span>
          )}
        </div>
      </div>

      {/* Room labels list */}
      {rooms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rooms.map((room) => (
            <div key={room.id} className="flex items-center gap-1 bg-gray-800 rounded-lg px-3 py-1 text-sm">
              <span className="text-blue-400">{room.label}</span>
              {onRemoveRoom && (
                <button
                  onClick={() => onRemoveRoom(room.id)}
                  className="text-gray-500 hover:text-red-400 ml-1"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl overflow-hidden border border-gray-800 bg-gray-900"
        style={{ cursor: addingRoom ? 'crosshair' : isPanning ? 'grabbing' : playerPos ? 'crosshair' : 'pointer' }}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onClick={handleCanvasClick}
          onContextMenu={handleContextMenu}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          tabIndex={0}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <span>Your Position</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full border-2 border-blue-500" />
          <span>Destination</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-blue-500" />
          <span>Path</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-500/30" />
          <span>Walkable</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/30" />
          <span>Blocked</span>
        </div>
        <div className="flex items-center gap-2 ml-3">
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] font-mono border border-gray-700">Click</kbd>
          <span>place</span>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] font-mono border border-gray-700">WASD</kbd>
          <span>move</span>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] font-mono border border-gray-700">Right-click</kbd>
          <span>navigate</span>
          <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-[10px] font-mono border border-gray-700">Scroll</kbd>
          <span>zoom</span>
        </div>
      </div>
    </div>
  );
}
