'use client';

import { useState, useCallback, RefObject } from 'react';
import { useMapProjectStore } from '@/store/mapProjectStore';

interface Props {
  subMapId: string;
  floorId: string;
  imageWidth: number;
  imageHeight: number;
  zoom: number;
  offset: { x: number; y: number };
  container: RefObject<HTMLDivElement | null>;
}

export function BlockedZoneTool({
  subMapId, floorId, imageWidth, imageHeight, zoom, offset, container,
}: Props) {
  const { rescue, addBlockedCells, clearBlockedCells } = useMapProjectStore();
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [blockedActive, setBlockedActive] = useState(false);

  const toNormalized = useCallback((clientX: number, clientY: number) => {
    if (!container.current) return null;
    const rect = container.current.getBoundingClientRect();
    const imgW = imageWidth * zoom;
    const imgH = imageHeight * zoom;
    const imgLeft = rect.width / 2 + offset.x - imgW / 2;
    const imgTop = rect.height / 2 + offset.y - imgH / 2;
    const x = (clientX - rect.left - imgLeft) / imgW;
    const y = (clientY - rect.top - imgTop) / imgH;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }, [container, imageWidth, imageHeight, zoom, offset]);

  const blockedEntry = rescue.blockedCells.find(b => b.subMapId === subMapId && b.floorId === floorId);
  const hasBlocked = (blockedEntry?.cells.length ?? 0) > 0;

  if (!blockedActive && !hasBlocked) {
    return (
      <div
        className="absolute bottom-14 left-4 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setBlockedActive(true)}
          className="px-3 py-1.5 text-xs bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/25 rounded-lg backdrop-blur-sm transition-all"
        >
          + Mark Blocked Zone
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Blocked zones visualization */}
      {blockedEntry && blockedEntry.cells.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {blockedEntry.cells.map((cell, i) => {
            const imgW = imageWidth * zoom;
            const imgH = imageHeight * zoom;
            // Approximate cell size
            const cellW = imgW / 150;  // approximate 150 cells
            const cellH = imgH / 150;
            const rect = container.current?.getBoundingClientRect();
            if (!rect) return null;
            const imgLeft = rect.width / 2 + offset.x - imgW / 2;
            const imgTop = rect.height / 2 + offset.y - imgH / 2;

            return (
              <div
                key={i}
                className="absolute bg-orange-500/40 border border-orange-500/60"
                style={{
                  left: imgLeft + cell.col * cellW,
                  top: imgTop + cell.row * cellH,
                  width: cellW,
                  height: cellH,
                }}
              />
            );
          })}
        </div>
      )}

      {/* Control bar */}
      <div
        className="absolute bottom-14 left-4 flex gap-2 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {hasBlocked && (
          <button
            onClick={() => clearBlockedCells(subMapId, floorId)}
            className="px-3 py-1.5 text-xs bg-slate-800/90 hover:bg-slate-700 text-slate-400 border border-slate-700 rounded-lg backdrop-blur-sm transition-all"
          >
            Clear Blocks
          </button>
        )}
        <button
          onClick={() => setBlockedActive(!blockedActive)}
          className={`px-3 py-1.5 text-xs rounded-lg border backdrop-blur-sm transition-all ${
            blockedActive
              ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
              : 'bg-slate-800/90 border-slate-700 text-slate-400 hover:text-orange-300 hover:border-orange-500/30'
          }`}
        >
          {blockedActive ? '✏️ Drawing Mode ON' : '+ Mark Blocked Zone'}
        </button>
      </div>
    </>
  );
}
