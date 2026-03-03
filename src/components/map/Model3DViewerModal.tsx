'use client';

import { useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { Model3DAsset } from '@/lib/types';

// Dynamically import the 3D viewer to avoid SSR issues with Three.js
const ThreeDViewer = dynamic(
  () => import('./ThreeDViewer').then(m => ({ default: m.ThreeDViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Initializing 3D viewer...</p>
        </div>
      </div>
    ),
  }
);

interface Props {
  asset: Model3DAsset;
  onClose: () => void;
}

export function Model3DViewerModal({ asset, onClose }: Props) {
  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const formatLabel = asset.format === 'splat' ? 'Gaussian Splat' : asset.format.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-[90vw] h-[85vh] max-w-6xl bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              <span className="text-sm">🧊</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                {asset.label || '3D Model'}
              </h2>
              <p className="text-[10px] text-slate-500">
                {formatLabel} · {asset.url.split('/').pop()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Format badge */}
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              {formatLabel}
            </span>

            {/* Close button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 3D Canvas */}
        <div className="flex-1 relative bg-[#0a0d14]">
          <ThreeDViewer asset={asset} />
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-slate-800 bg-slate-900/95 text-[10px] text-slate-500 shrink-0">
          <span>Drag to rotate · Scroll to zoom · Right-click to pan</span>
          <span>Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}
