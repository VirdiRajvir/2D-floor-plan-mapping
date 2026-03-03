'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MapProject } from '@/lib/types';
import { ApiKeySettingsButton } from '@/components/ApiKeySettings';

export default function LandingPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<MapProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/maps')
      .then(r => r.ok ? r.json() : [])
      .then((data: MapProject[]) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this map project?')) return;
    await fetch(`/api/maps/${id}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100">
      {/* Nav */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2} className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-100">SafeMap</h1>
              <p className="text-[10px] text-slate-500">Disaster Response Navigation System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/navigate"
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 rounded-xl transition-all"
            >
              Quick Navigate
            </a>
            <ApiKeySettingsButton />
            <button
              onClick={() => router.push('/setup')}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-xl transition-all shadow-lg shadow-amber-500/20 text-sm"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              New Map Project
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium mb-4">
            <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
            Emergency-Ready Navigation System
          </div>
          <h2 className="text-4xl font-bold text-slate-100 mb-3">
            Interactive Floor Plan
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400"> Navigation</span>
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-base leading-relaxed">
            Upload campus and building maps, connect them hierarchically, and calculate optimal rescue routes
            with real-time obstacle avoidance. Built for firefighters, emergency responders, and facility managers.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {[
            {
              icon: '🗺️',
              title: 'Hierarchical Maps',
              desc: 'Campus → Building → Floor. Click pins to zoom seamlessly into sub-maps.',
            },
            {
              icon: '🔍',
              title: 'Wall & Door Detection',
              desc: 'AI-powered detection of walls, doors, windows, balconies, and restricted zones.',
            },
            {
              icon: '🔥',
              title: 'Rescue Routing',
              desc: 'A* shortest path for firefighters. Mark blocked zones, auto-recalculate routes.',
            },
          ].map(f => (
            <div
              key={f.title}
              className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1.5">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Projects */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold text-slate-200">Your Map Projects</h3>
            {projects.length > 0 && (
              <span className="text-xs text-slate-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mr-3" />
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-800 rounded-2xl">
              <div className="text-5xl mb-4">🗺️</div>
              <p className="text-slate-400 mb-2 font-medium">No map projects yet</p>
              <p className="text-slate-600 text-sm mb-6">Create your first map by uploading floor plan images</p>
              <button
                onClick={() => router.push('/setup')}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold rounded-xl transition-all text-sm"
              >
                Create First Map
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => router.push(`/map/${project.id}`)}
                  onEdit={() => router.push(`/setup/${project.id}`)}
                  onDelete={(e) => deleteProject(project.id, e)}
                />
              ))}
              <button
                onClick={() => router.push('/setup')}
                className="h-44 rounded-2xl border-2 border-dashed border-slate-800 hover:border-amber-500/30 flex flex-col items-center justify-center gap-2 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800 group-hover:bg-amber-500/15 flex items-center justify-center transition-all">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-500 group-hover:text-amber-400 transition-colors">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-sm text-slate-500 group-hover:text-amber-400 transition-colors">New Map Project</span>
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ProjectCard({
  project, onOpen, onEdit, onDelete,
}: {
  project: MapProject;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const pinCount = project.masterMap.pins.length;
  const floorCount = project.subMaps.reduce((s, sm) => s + sm.floors.length, 0);
  const createdDate = new Date(project.createdAt).toLocaleDateString();

  return (
    <div
      className="group relative rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 overflow-hidden cursor-pointer transition-all hover:shadow-xl hover:shadow-black/30"
      onClick={onOpen}
    >
      <div className="h-32 bg-slate-800 relative overflow-hidden">
        {project.masterMap.imageUrl ? (
          <img src={project.masterMap.imageUrl} alt={project.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-700 text-4xl">🗺️</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="w-7 h-7 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-slate-800/90 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition-all"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      <div className="p-4">
        <h4 className="text-sm font-semibold text-slate-200 mb-1 truncate">{project.name}</h4>
        <div className="flex items-center gap-3 text-[10px] text-slate-600">
          <span>{pinCount} building{pinCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{floorCount} floor{floorCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>{createdDate}</span>
        </div>
      </div>
    </div>
  );
}
