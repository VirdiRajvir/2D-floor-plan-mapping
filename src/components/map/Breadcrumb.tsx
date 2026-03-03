'use client';

import { useMapProjectStore } from '@/store/mapProjectStore';

export function Breadcrumb() {
  const {
    project,
    viewLevel,
    activeSubMapId,
    activeFloorId,
    triggerZoomOut,
  } = useMapProjectStore();

  if (!project) return null;

  const activeSubMap = project.subMaps.find(s => s.id === activeSubMapId);
  const activeFloor = activeSubMap?.floors.find(f => f.id === activeFloorId);

  return (
    <div className="flex items-center gap-1 text-xs text-slate-500">
      <button
        onClick={viewLevel === 'submap' ? triggerZoomOut : undefined}
        className={`transition-colors ${viewLevel === 'submap' ? 'hover:text-slate-300 cursor-pointer' : 'cursor-default text-slate-400'}`}
      >
        {project.name}
      </button>

      {viewLevel === 'submap' && activeSubMap && (
        <>
          <span className="text-slate-700">/</span>
          <span className="text-slate-300">{activeSubMap.name}</span>
          {activeFloor && (activeSubMap.floors.length > 1) && (
            <>
              <span className="text-slate-700">/</span>
              <span className="text-slate-400">{activeFloor.label}</span>
            </>
          )}
        </>
      )}
    </div>
  );
}
