'use client';

import type { FloorLevel } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';

interface Props {
  floors: FloorLevel[];
  activeFloorId: string;
}

export function FloorSelector({ floors, activeFloorId }: Props) {
  const { setActiveFloor } = useMapProjectStore();

  if (floors.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 bg-slate-800/80 rounded-lg p-1 border border-slate-700 backdrop-blur-sm">
      {[...floors]
        .sort((a, b) => b.floorNumber - a.floorNumber)
        .map(floor => (
          <button
            key={floor.id}
            onClick={() => setActiveFloor(floor.id)}
            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
              floor.id === activeFloorId
                ? 'bg-amber-500 text-slate-900'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            {floor.label || `Floor ${floor.floorNumber}`}
          </button>
        ))}
    </div>
  );
}
