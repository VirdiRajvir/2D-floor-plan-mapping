'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { MapProject } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';

export default function EditSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { setProject } = useMapProjectStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/maps/${params.id}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: MapProject | null) => {
        if (!data) { setError('Project not found'); return; }
        setProject(data);
        // Redirect to main map view since inline editing is complex
        router.push(`/map/${params.id}`);
      })
      .catch(() => setError('Failed to load project'))
      .finally(() => setLoading(false));
  }, [params.id, setProject, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
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

  return null;
}
