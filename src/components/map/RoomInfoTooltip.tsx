'use client';

import type { RoomAnnotation } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';

interface Props {
  room: RoomAnnotation;
  position: { x: number; y: number };
  onSetAsRescuer: () => void;
  onSetAsRescuee: () => void;
}

export function RoomInfoTooltip({ room, position, onSetAsRescuer, onSetAsRescuee }: Props) {
  const { isRescueMode } = useMapProjectStore();

  return (
    <div
      className="fixed z-50 pointer-events-auto"
      style={{ left: position.x + 12, top: position.y - 10 }}
    >
      <div className="bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl shadow-black/60 min-w-36 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: room.color ?? '#818cf8' }}
          />
          <p className="text-sm font-semibold text-slate-200">{room.label}</p>
        </div>
        {room.type && (
          <p className="text-xs text-slate-500 mb-2">{room.type}</p>
        )}

        {isRescueMode && (
          <div className="flex flex-col gap-1.5 mt-2 pt-2 border-t border-slate-800">
            <button
              onClick={onSetAsRescuer}
              className="text-xs px-2 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 rounded-lg border border-amber-500/25 transition-all text-left"
            >
              🔥 Set as Rescuer location
            </button>
            <button
              onClick={onSetAsRescuee}
              className="text-xs px-2 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-300 rounded-lg border border-red-500/25 transition-all text-left"
            >
              🆘 Set as Rescuee location
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
