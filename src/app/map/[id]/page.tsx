'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { MapProject, Model3DAsset } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';
import { HierarchicalMapCanvas } from '@/components/map/HierarchicalMapCanvas';
import { Breadcrumb } from '@/components/map/Breadcrumb';
import { RescuePanel } from '@/components/map/RescuePanel';
import { FloorSelector } from '@/components/map/FloorSelector';
import { FirefighterAgent } from '@/components/chat/FirefighterAgent';
import { Model3DViewerModal } from '@/components/map/Model3DViewerModal';

export default function MapViewerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('edit') === '1';
  const { setProject, project, viewLevel, activeSubMapId, activeFloorId, isRescueMode, toggleRescueMode } = useMapProjectStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewing3D, setViewing3D] = useState<Model3DAsset | null>(null);
  const [simPosition, setSimPosition] = useState<{ x: number; y: number } | null>(null);
  const [simPlaying, setSimPlaying] = useState(false);

  const handleSimPositionUpdate = useCallback((pos: { x: number; y: number } | null, playing: boolean) => {
    setSimPosition(pos);
    setSimPlaying(playing);
  }, []);

  useEffect(() => {
    if (!params.id) return;

    async function loadProject() {
      try {
        const res = await fetch(`/api/maps/${params.id}`);
        if (!res.ok) {
          setError('Map project not found.');
          return;
        }
        const data = await res.json() as MapProject;
        setProject(data);
      } catch {
        setError('Failed to load map project.');
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [params.id, setProject]);

  const activeSubMap = project?.subMaps.find(s => s.id === activeSubMapId);
  const hasMultipleFloors = (activeSubMap?.floors.length ?? 0) > 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading map...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Project not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-5 py-2.5 bg-slate-700 text-slate-200 rounded-xl hover:bg-slate-600 transition-colors text-sm"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0a0d14] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80 bg-[#0a0d14]/95 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </a>
          <div>
            <h1 className="text-sm font-semibold text-slate-200">{project.name}</h1>
            <Breadcrumb />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Floor selector — shown when in a multi-floor building */}
          {viewLevel === 'submap' && hasMultipleFloors && activeSubMap && (
            <FloorSelector floors={activeSubMap.floors} activeFloorId={activeFloorId ?? ''} />
          )}

          {/* Rescue mode toggle */}
          <button
            onClick={toggleRescueMode}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-all flex items-center gap-1.5 ${
              isRescueMode
                ? 'bg-red-500/20 border-red-500/40 text-red-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-500/30'
            }`}
          >
            🔥 Rescue
          </button>

          {/* Project actions */}
          <a
            href={`/map/${project.id}?edit=1`}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-lg transition-all"
          >
            Edit Setup
          </a>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map canvas */}
        <div className={`flex-1 relative ${isRescueMode ? 'mr-0 md:mr-80' : ''} transition-all duration-300`}>
          <HierarchicalMapCanvas project={project} on3DPinClick={setViewing3D} isSetupMode={isEditMode} simPosition={simPosition} simPlaying={simPlaying} />
        </div>

        {/* Rescue panel sidebar */}
        {isRescueMode && (
          <div className="absolute right-0 top-0 bottom-0 w-80 z-10 md:relative">
            <RescuePanel onSimPositionUpdate={handleSimPositionUpdate} />
          </div>
        )}
      </div>

      {/* Firefighter AI Assistant */}
      <FirefighterAgent />

      {/* 3D Model Viewer Modal */}
      {viewing3D && (
        <Model3DViewerModal asset={viewing3D} onClose={() => setViewing3D(null)} />
      )}
    </div>
  );
}
