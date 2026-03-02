'use client';

import React, { useState } from 'react';
import { useMapStore } from '@/store/mapStore';

export default function SequenceManager() {
  const { floorPlans, reorderFloorPlans, getOrderedFloorPlans } = useMapStore();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const ordered = getOrderedFloorPlans();

  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;

    const currentOrder = ordered.map((p) => p.id);
    const fromIndex = currentOrder.indexOf(draggedId);
    const toIndex = currentOrder.indexOf(targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    currentOrder.splice(fromIndex, 1);
    currentOrder.splice(toIndex, 0, draggedId);
    reorderFloorPlans(currentOrder);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
  };

  const moveUp = (id: string) => {
    const currentOrder = ordered.map((p) => p.id);
    const idx = currentOrder.indexOf(id);
    if (idx <= 0) return;
    [currentOrder[idx - 1], currentOrder[idx]] = [currentOrder[idx], currentOrder[idx - 1]];
    reorderFloorPlans(currentOrder);
  };

  const moveDown = (id: string) => {
    const currentOrder = ordered.map((p) => p.id);
    const idx = currentOrder.indexOf(id);
    if (idx >= currentOrder.length - 1) return;
    [currentOrder[idx], currentOrder[idx + 1]] = [currentOrder[idx + 1], currentOrder[idx]];
    reorderFloorPlans(currentOrder);
  };

  if (floorPlans.length < 2) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">Upload at least 2 floor plans to arrange a sequence.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Arrange Room Sequence</h2>
        <p className="text-gray-400">
          Drag and drop to define visual room order on the map. You can still create flexible cross-room connections in the next step.
        </p>
      </div>

      {/* Sequence visualization */}
      <div className="flex items-center justify-center gap-2 py-4 overflow-x-auto">
        {ordered.map((plan, index) => (
          <React.Fragment key={plan.id}>
            <div className="flex-shrink-0 bg-blue-600/20 border border-blue-500/30 rounded-lg px-4 py-2 text-center">
              <span className="text-blue-400 text-sm font-bold">#{index + 1}</span>
              <p className="text-white text-sm font-medium truncate max-w-[100px]">{plan.name}</p>
            </div>
            {index < ordered.length - 1 && (
              <svg className="w-6 h-6 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Sortable list */}
      <div className="space-y-2 max-w-2xl mx-auto">
        {ordered.map((plan, index) => (
          <div
            key={plan.id}
            draggable
            onDragStart={() => handleDragStart(plan.id)}
            onDragOver={(e) => handleDragOver(e, plan.id)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-4 bg-gray-800 rounded-xl p-4 border transition-all cursor-grab active:cursor-grabbing
              ${draggedId === plan.id ? 'border-blue-500 opacity-50' : 'border-gray-700 hover:border-gray-600'}`}
          >
            {/* Drag handle */}
            <div className="text-gray-500">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
              </svg>
            </div>

            {/* Order badge */}
            <div className="bg-blue-600 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
              {index + 1}
            </div>

            {/* Thumbnail */}
            <div className="w-16 h-12 rounded-lg overflow-hidden bg-gray-900 flex-shrink-0">
              <img src={plan.imageUrl} alt={plan.name} className="w-full h-full object-cover" />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{plan.name}</p>
              <p className="text-gray-500 text-xs">
                {index === 0 ? 'Start' : index === ordered.length - 1 ? 'End' : `Room ${index + 1}`}
                {index < ordered.length - 1 && ' → Exit to next room'}
                {index > 0 && ' ← Entry from previous room'}
              </p>
            </div>

            {/* Move buttons */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => moveUp(plan.id)}
                disabled={index === 0}
                className="text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={() => moveDown(plan.id)}
                disabled={index === ordered.length - 1}
                className="text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Connection info */}
      <div className="bg-gray-800/50 rounded-xl p-4 max-w-2xl mx-auto text-sm text-gray-400">
        In the next step, you can connect any room to any room and add multiple pathway datasets per connection.
      </div>
    </div>
  );
}
