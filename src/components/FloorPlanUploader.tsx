'use client';

import React, { useCallback, useRef } from 'react';
import { useMapStore } from '@/store/mapStore';

export default function FloorPlanUploader() {
  const { floorPlans, addFloorPlan, removeFloorPlan, updateFloorPlanName } = useMapStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (let i = 0; i < files.length; i++) {
        if (floorPlans.length + i >= 5) break;
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        const name = `Room ${floorPlans.length + i + 1}`;
        addFloorPlan(file, name);
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [floorPlans.length, addFloorPlan]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;

      for (let i = 0; i < files.length; i++) {
        if (floorPlans.length + i >= 5) break;
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        const name = `Room ${floorPlans.length + i + 1}`;
        addFloorPlan(file, name);
      }
    },
    [floorPlans.length, addFloorPlan]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Upload Floor Plans</h2>
        <p className="text-gray-400">
          Upload up to 5 floor plan images. These will represent individual rooms or zones.
        </p>
      </div>

      {/* Drop zone */}
      {floorPlans.length < 5 && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center cursor-pointer
                     hover:border-blue-500 hover:bg-blue-500/5 transition-all duration-200"
        >
          <div className="flex flex-col items-center gap-3">
            <svg className="w-12 h-12 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-gray-400">
              <span className="text-blue-400 font-medium">Click to browse</span> or drag & drop floor plan images
            </p>
            <p className="text-sm text-gray-500">
              PNG, JPG, SVG up to 10MB • {5 - floorPlans.length} slots remaining
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}

      {/* Floor plan cards */}
      {floorPlans.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...floorPlans]
            .sort((a, b) => a.order - b.order)
            .map((plan, index) => (
              <div
                key={plan.id}
                className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-gray-600 transition-colors"
              >
                <div className="relative aspect-[4/3] bg-gray-900">
                  <img
                    src={plan.imageUrl}
                    alt={plan.name}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">
                    #{index + 1}
                  </div>
                  <button
                    onClick={() => removeFloorPlan(plan.id)}
                    className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="p-3">
                  <input
                    type="text"
                    value={plan.name}
                    onChange={(e) => updateFloorPlanName(plan.id, e.target.value)}
                    className="w-full bg-gray-700 text-white px-3 py-1.5 rounded-lg text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                    placeholder="Room name"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {plan.file?.name} • {plan.file ? (plan.file.size / 1024).toFixed(0) : 0} KB
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}

      {floorPlans.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No floor plans uploaded yet</p>
        </div>
      )}
    </div>
  );
}
