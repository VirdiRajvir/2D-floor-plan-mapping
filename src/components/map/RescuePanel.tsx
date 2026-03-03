'use client';

import { useMapProjectStore } from '@/store/mapProjectStore';
import { TrackingSimulator } from './TrackingSimulator';

interface RescuePanelProps {
  /** Callback to report the simulated firefighter position on the map */
  onSimPositionUpdate?: (position: { x: number; y: number } | null, isPlaying: boolean) => void;
}

export function RescuePanel({ onSimPositionUpdate }: RescuePanelProps) {
  const {
    rescue,
    project,
    isRescueMode,
    rescuePlacingFor,
    toggleRescueMode,
    startPlacingRescuer,
    startPlacingRescuee,
    clearRescue,
    activeSubMapId,
    activeFloorId,
  } = useMapProjectStore();

  const { rescuer, rescuee, pathSegments, totalDistance, estimatedMinutes } = rescue;

  const activeSubMap = project?.subMaps.find(s => s.id === activeSubMapId);
  const activeFloor = activeSubMap?.floors.find(f => f.id === activeFloorId);

  // Multi-segment support (Feature B)
  const walkSegments = pathSegments.filter(s => s.type === 'walk');
  const hasPath = walkSegments.some(s => s.points.length > 1);
  const totalWaypoints = walkSegments.reduce((n, s) => n + s.points.length, 0);

  // Primary walk segment for the tracking simulator (rescuer's floor)
  const primaryWalkSeg = pathSegments.find(
    s => s.type === 'walk' && s.subMapId === rescuer?.subMapId && s.floorId === rescuer?.floorId
  );

  return (
    <div className="h-full bg-[#0f1320]/95 border-l border-slate-800 backdrop-blur-sm flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
            <h2 className="text-sm font-semibold text-slate-200">Rescue Mode</h2>
          </div>
          <button
            onClick={() => { clearRescue(); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear & Exit
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {activeSubMap?.name} {activeFloor && activeSubMap && activeSubMap.floors.length > 1 ? `— ${activeFloor.label}` : ''}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* Marker placement buttons */}
        <div className="space-y-2">
          <button
            onClick={startPlacingRescuer}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              rescuePlacingFor === 'rescuer'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : rescuer
                ? 'bg-slate-800/60 border-amber-500/30 text-slate-300'
                : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:border-amber-500/30 hover:text-amber-300'
            }`}
          >
            <span className="text-xl">🔥</span>
            <div>
              <p className="text-xs font-semibold">Rescuer (Firefighter)</p>
              {rescuer ? (
                <p className="text-[10px] text-amber-400">
                  {project?.subMaps.find(s => s.id === rescuer.subMapId)?.name ?? 'Building'} — ({(rescuer.x * 100).toFixed(0)}%, {(rescuer.y * 100).toFixed(0)}%)
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">
                  {rescuePlacingFor === 'rescuer' ? 'Click on map to place...' : 'Not placed'}
                </p>
              )}
            </div>
            {rescuer && (
              <span className="ml-auto text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">SET</span>
            )}
          </button>

          <button
            onClick={startPlacingRescuee}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
              rescuePlacingFor === 'rescuee'
                ? 'bg-red-500/15 border-red-500/40 text-red-300'
                : rescuee
                ? 'bg-slate-800/60 border-red-500/30 text-slate-300'
                : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:border-red-500/30 hover:text-red-300'
            }`}
          >
            <span className="text-xl">🆘</span>
            <div>
              <p className="text-xs font-semibold">Rescuee (Person Trapped)</p>
              {rescuee ? (
                <p className="text-[10px] text-red-400">
                  {project?.subMaps.find(s => s.id === rescuee.subMapId)?.name ?? 'Building'} — ({(rescuee.x * 100).toFixed(0)}%, {(rescuee.y * 100).toFixed(0)}%)
                </p>
              ) : (
                <p className="text-[10px] text-slate-500">
                  {rescuePlacingFor === 'rescuee' ? 'Click on map to place...' : 'Not placed'}
                </p>
              )}
            </div>
            {rescuee && (
              <span className="ml-auto text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">SET</span>
            )}
          </button>
        </div>

        {/* Path stats */}
        {hasPath && (
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 space-y-2">
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-cyan-400">
                <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Route Calculated
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900/60 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-cyan-400">{totalDistance.toFixed(0)}m</p>
                <p className="text-[10px] text-slate-500">Distance</p>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-amber-400">~{estimatedMinutes.toFixed(1)} min</p>
                <p className="text-[10px] text-slate-500">Est. time</p>
              </div>
              <div className="bg-slate-900/60 rounded-lg p-2 text-center col-span-2">
                <p className="text-sm font-bold text-slate-300">{totalWaypoints} waypoints</p>
                <p className="text-[10px] text-slate-500">Path steps</p>
              </div>
            </div>
          </div>
        )}

        {/* Tracking simulator — uses the first walk segment on the rescuer's floor */}
        {hasPath && primaryWalkSeg && (
          <TrackingSimulator
            points={primaryWalkSeg.points}
            imageWidth={activeFloor?.width ?? 800}
            imageHeight={activeFloor?.height ?? 600}
            onPositionUpdate={onSimPositionUpdate}
          />
        )}

        {/* Multi-segment route steps — mall directory style */}
        {pathSegments.length > 0 && (
          <div className="space-y-2">
            {/* Cross-building / cross-floor directory banner */}
            {rescuer && rescuee && (rescuer.subMapId !== rescuee.subMapId || rescuer.floorId !== rescuee.floorId) && (
              <div className="bg-gradient-to-r from-indigo-500/15 to-violet-500/15 rounded-xl p-3 border border-indigo-500/25 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏢</span>
                  <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Navigation Directory</h3>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <div className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-lg px-2 py-1">
                    <span>🔥</span>
                    <span className="text-amber-300 font-medium">
                      {project?.subMaps.find(s => s.id === rescuer.subMapId)?.name ?? 'Building'}
                    </span>
                  </div>
                  <span className="text-slate-500">→</span>
                  <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/30 rounded-lg px-2 py-1">
                    <span>🆘</span>
                    <span className="text-red-300 font-medium">
                      {project?.subMaps.find(s => s.id === rescuee.subMapId)?.name ?? 'Building'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Route Steps</h3>
            {pathSegments.map((seg, idx) => {
              const segBuilding = project?.subMaps.find(s => s.id === seg.subMapId);
              if (seg.type === 'stairs') {
                const fromFloor = segBuilding?.floors.find(f => f.id === seg.floorId);
                return (
                  <div key={idx} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                    <span className="text-base">🪜</span>
                    <div>
                      <p className="text-xs text-violet-300 font-medium">Take stairs</p>
                      <p className="text-[10px] text-violet-400/60">
                        {segBuilding?.name ?? 'Building'} — {fromFloor?.label ?? 'Floor'} → Next floor
                      </p>
                    </div>
                  </div>
                );
              }
              if (seg.type === 'transition') {
                const fromBldg = project?.subMaps.find(s => s.id === seg.subMapId)?.name ?? 'Building';
                // Try to find the next walk segment's building
                const nextWalk = pathSegments.slice(idx + 1).find(ns => ns.type === 'walk');
                const toBldg = nextWalk ? (project?.subMaps.find(s => s.id === nextWalk.subMapId)?.name ?? 'Building') : 'next building';
                return (
                  <div key={idx} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <span className="text-base">🏃</span>
                    <div>
                      <p className="text-xs text-cyan-300 font-medium">Cross-building transition</p>
                      <p className="text-[10px] text-cyan-400/60">
                        Exit <strong>{fromBldg}</strong> → Enter <strong>{toBldg}</strong>
                      </p>
                    </div>
                  </div>
                );
              }
              // Walk segment
              const segFloor = segBuilding?.floors.find(f => f.id === seg.floorId);
              const segDirs = generateDirections(seg.points);
              return (
                <div key={idx} className="space-y-1">
                  <p className="text-[10px] text-slate-500 font-medium">
                    {segBuilding?.name ?? 'Building'} — {segFloor?.label ?? 'Floor'}
                  </p>
                  {segDirs.map((dir, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-slate-800/60">
                      <span className="text-[10px] text-slate-600 w-5 shrink-0">{i + 1}</span>
                      <span className="text-sm">{dir.icon}</span>
                      <p className="text-xs text-slate-300">{dir.text}</p>
                      {dir.distance > 0 && (
                        <span className="ml-auto text-[10px] text-slate-500 shrink-0">{dir.distance.toFixed(0)}m</span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* No path / waiting state */}
        {!hasPath && rescuer && rescuee && (
          <div className="text-center py-6">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-400">Calculating optimal path...</p>
            {rescuer.subMapId !== rescuee.subMapId && (
              <p className="text-[10px] text-slate-600 mt-1">Cross-building route requires entry/exit points</p>
            )}
          </div>
        )}

        {!rescuer && !rescuee && (
          <div className="text-center py-6 text-slate-600">
            <div className="text-4xl mb-2">🗺️</div>
            <p className="text-xs">Place both markers on the map to calculate the rescue route</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface Direction {
  icon: string;
  text: string;
  distance: number;
}

function generateDirections(points: { x: number; y: number }[]): Direction[] {
  if (points.length < 2) return [];
  const dirs: Direction[] = [];

  dirs.push({ icon: '🚀', text: 'Start at rescuer position', distance: 0 });

  let segStart = 0;
  let lastAngle = getAngle(points[0], points[1]);

  for (let i = 1; i < points.length - 1; i++) {
    const angle = getAngle(points[i], points[i + 1]);
    const diff = normAngle(angle - lastAngle);

    if (Math.abs(diff) > 35) {
      const segDist = pathDistance(points.slice(segStart, i + 1));
      dirs.push({
        icon: diff > 0 ? '↩️' : '↪️',
        text: diff > 0 ? `Turn left` : `Turn right`,
        distance: segDist,
      });
      segStart = i;
      lastAngle = angle;
    }
  }

  const finalDist = pathDistance(points.slice(segStart));
  dirs.push({ icon: '🎯', text: 'Arrive at rescuee location', distance: finalDist });

  return dirs;
}

function getAngle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

function normAngle(a: number): number {
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

function pathDistance(pts: { x: number; y: number }[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d * 500; // approximate meters (assume 500m max across a floor)
}
