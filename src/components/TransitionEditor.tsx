'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useMapStore } from '@/store/mapStore';
import { parseCSVFile } from '@/lib/csvParser';
import { calculateTransitionPath } from '@/lib/pathCalculator';
import { MarkerPoint } from '@/lib/types';

type PointMode = 'exit' | 'entry' | null;

function ImageMarker({
  imageUrl,
  exitPoint,
  entryPoint,
  onSetExit,
  onSetEntry,
  label,
  showExit,
  showEntry,
}: {
  imageUrl: string;
  exitPoint: MarkerPoint | null;
  entryPoint: MarkerPoint | null;
  onSetExit: (point: MarkerPoint) => void;
  onSetEntry: (point: MarkerPoint) => void;
  label: string;
  showExit: boolean;
  showEntry: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<PointMode>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!mode || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (mode === 'exit') {
      onSetExit({ x, y });
    } else {
      onSetEntry({ x, y });
    }
    setMode(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <div className="flex gap-2">
          {showExit && (
            <button
              onClick={() => setMode(mode === 'exit' ? null : 'exit')}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                mode === 'exit'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {mode === 'exit' ? 'Click image to set exit...' : exitPoint ? 'Move Exit Point' : 'Set Exit Point'}
            </button>
          )}
          {showEntry && (
            <button
              onClick={() => setMode(mode === 'entry' ? null : 'entry')}
              className={`text-xs px-3 py-1 rounded-lg font-medium transition-colors ${
                mode === 'entry'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {mode === 'entry' ? 'Click image to set entry...' : entryPoint ? 'Move Entry Point' : 'Set Entry Point'}
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        onClick={handleClick}
        className={`relative bg-gray-900 rounded-lg overflow-hidden border-2 transition-colors ${
          mode ? 'border-yellow-500 cursor-crosshair' : 'border-gray-700'
        }`}
      >
        <img
          src={imageUrl}
          alt={label}
          className="w-full h-auto max-h-[300px] object-contain"
          draggable={false}
        />

        {/* Exit point marker */}
        {exitPoint && (
          <div
            className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center"
            style={{ left: `${exitPoint.x}%`, top: `${exitPoint.y}%` }}
          >
            <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
            <span className="absolute -top-5 text-[10px] font-bold text-red-400 bg-gray-900/80 px-1 rounded whitespace-nowrap">
              EXIT
            </span>
          </div>
        )}

        {/* Entry point marker */}
        {entryPoint && (
          <div
            className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center"
            style={{ left: `${entryPoint.x}%`, top: `${entryPoint.y}%` }}
          >
            <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
            <span className="absolute -top-5 text-[10px] font-bold text-green-400 bg-gray-900/80 px-1 rounded whitespace-nowrap">
              ENTRY
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransitionEditor() {
  const {
    transitions,
    floorPlans,
    getOrderedFloorPlans,
    updateTransitionCSV,
    setTransitionPath,
    setExitPoint,
    setEntryPoint,
    isProcessing,
    setIsProcessing,
  } = useMapStore();

  const [activeTransitionIdx, setActiveTransitionIdx] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const linAccelRef = useRef<HTMLInputElement>(null);
  const gyroRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const ordered = getOrderedFloorPlans();

  const handleFolderUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>, transitionId: string) => {
      const files = e.target.files;
      if (!files) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const name = file.name.toLowerCase();

        if (name.includes('linear') && name.includes('accelerometer')) {
          updateTransitionCSV(transitionId, 'linearAccelerometer', file);
        } else if (name.includes('gyroscope')) {
          updateTransitionCSV(transitionId, 'gyroscope', file);
        } else if (name.includes('accelerometer')) {
          updateTransitionCSV(transitionId, 'accelerometer', file);
        } else if (name.includes('gravity')) {
          updateTransitionCSV(transitionId, 'gravity', file);
        }
      }
      setUploadStatus((prev) => ({ ...prev, [transitionId]: 'Files detected and assigned' }));
    },
    [updateTransitionCSV]
  );

  const handleSingleFile = useCallback(
    (transitionId: string, fileType: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      updateTransitionCSV(transitionId, fileType, file);
    },
    [updateTransitionCSV]
  );

  const processTransition = useCallback(
    async (transitionId: string) => {
      const transition = transitions.find((t) => t.id === transitionId);
      if (!transition) return;

      const { linearAccelerometer, gyroscope } = transition.csvFiles;
      if (!linearAccelerometer || !gyroscope) {
        setUploadStatus((prev) => ({
          ...prev,
          [transitionId]: 'Need both Linear Accelerometer and Gyroscope CSV files',
        }));
        return;
      }

      setIsProcessing(true);
      setUploadStatus((prev) => ({ ...prev, [transitionId]: 'Processing sensor data...' }));

      try {
        const [linAccelData, gyroData] = await Promise.all([
          parseCSVFile(linearAccelerometer),
          parseCSVFile(gyroscope),
        ]);

        const path = calculateTransitionPath(linAccelData, gyroData);
        setTransitionPath(transitionId, path);
        setUploadStatus((prev) => ({
          ...prev,
          [transitionId]: `Processed! Distance: ${path.totalDistance}m, Duration: ${path.duration}s`,
        }));
      } catch (err) {
        console.error('Error processing CSV:', err);
        setUploadStatus((prev) => ({
          ...prev,
          [transitionId]: `Error: ${err instanceof Error ? err.message : 'Processing failed'}`,
        }));
      } finally {
        setIsProcessing(false);
      }
    },
    [transitions, setIsProcessing, setTransitionPath]
  );

  if (transitions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">No transitions to configure. Need at least 2 rooms.</p>
      </div>
    );
  }

  const currentTransition = transitions[activeTransitionIdx];
  if (!currentTransition) return null;

  const fromRoom = floorPlans.find((p) => p.id === currentTransition.fromRoomId);
  const toRoom = floorPlans.find((p) => p.id === currentTransition.toRoomId);

  if (!fromRoom || !toRoom) return null;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Configure Transitions</h2>
        <p className="text-gray-400">
          Upload sensor data for each room-to-room transition and mark entry/exit points.
        </p>
      </div>

      {/* Transition tabs */}
      <div className="flex gap-2 justify-center">
        {transitions.map((t, idx) => {
          const from = floorPlans.find((p) => p.id === t.fromRoomId);
          const to = floorPlans.find((p) => p.id === t.toRoomId);
          return (
            <button
              key={t.id}
              onClick={() => setActiveTransitionIdx(idx)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                idx === activeTransitionIdx
                  ? 'bg-blue-600 text-white'
                  : t.processed
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {from?.name} → {to?.name}
              {t.processed && ' ✓'}
            </button>
          );
        })}
      </div>

      {/* Current transition editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* From room */}
        <ImageMarker
          imageUrl={fromRoom.imageUrl}
          exitPoint={fromRoom.exitPoint}
          entryPoint={fromRoom.entryPoint}
          onSetExit={(point) => setExitPoint(fromRoom.id, point)}
          onSetEntry={(point) => setEntryPoint(fromRoom.id, point)}
          label={`${fromRoom.name} (Exit)`}
          showExit={true}
          showEntry={ordered[0]?.id !== fromRoom.id}
        />

        {/* To room */}
        <ImageMarker
          imageUrl={toRoom.imageUrl}
          exitPoint={toRoom.exitPoint}
          entryPoint={toRoom.entryPoint}
          onSetExit={(point) => setExitPoint(toRoom.id, point)}
          onSetEntry={(point) => setEntryPoint(toRoom.id, point)}
          label={`${toRoom.name} (Entry)`}
          showExit={ordered[ordered.length - 1]?.id !== toRoom.id}
          showEntry={true}
        />
      </div>

      {/* CSV Upload section */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <h3 className="text-white font-medium">Sensor Data for this Transition</h3>
        <p className="text-gray-400 text-sm">
          Upload a folder of sensor CSVs or individual files from walking between these rooms.
        </p>

        {/* Folder upload */}
        <div className="border border-dashed border-gray-600 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Upload Data Folder (auto-detects file types)
          </label>
          <input
            ref={folderRef}
            type="file"
            multiple
            accept=".csv"
            onChange={(e) => handleFolderUpload(e, currentTransition.id)}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
          />
        </div>

        {/* Individual file uploads */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Linear Accelerometer CSV {currentTransition.csvFiles.linearAccelerometer && '✓'}
            </label>
            <input
              ref={linAccelRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleSingleFile(currentTransition.id, 'linearAccelerometer', e)}
              className="block w-full text-sm text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-700 file:text-white hover:file:bg-gray-600 file:cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Gyroscope CSV {currentTransition.csvFiles.gyroscope && '✓'}
            </label>
            <input
              ref={gyroRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleSingleFile(currentTransition.id, 'gyroscope', e)}
              className="block w-full text-sm text-gray-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-700 file:text-white hover:file:bg-gray-600 file:cursor-pointer"
            />
          </div>
        </div>

        {/* File status */}
        <div className="flex items-center gap-4 text-sm">
          <div className={`flex items-center gap-1 ${currentTransition.csvFiles.linearAccelerometer ? 'text-green-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${currentTransition.csvFiles.linearAccelerometer ? 'bg-green-500' : 'bg-gray-600'}`} />
            Linear Accel
          </div>
          <div className={`flex items-center gap-1 ${currentTransition.csvFiles.gyroscope ? 'text-green-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${currentTransition.csvFiles.gyroscope ? 'bg-green-500' : 'bg-gray-600'}`} />
            Gyroscope
          </div>
        </div>

        {/* Process button */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => processTransition(currentTransition.id)}
            disabled={isProcessing || !currentTransition.csvFiles.linearAccelerometer || !currentTransition.csvFiles.gyroscope}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
          >
            {isProcessing ? 'Processing...' : currentTransition.processed ? 'Re-process Data' : 'Process Sensor Data'}
          </button>

          {uploadStatus[currentTransition.id] && (
            <span className={`text-sm ${currentTransition.processed ? 'text-green-400' : 'text-yellow-400'}`}>
              {uploadStatus[currentTransition.id]}
            </span>
          )}
        </div>

        {/* Path preview */}
        {currentTransition.path && (
          <div className="bg-gray-900 rounded-lg p-4">
            <h4 className="text-white text-sm font-medium mb-3">Calculated Path Preview</h4>
            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <div>
                <p className="text-2xl font-bold text-blue-400">{currentTransition.path.totalDistance}m</p>
                <p className="text-xs text-gray-500">Total Distance</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{currentTransition.path.duration}s</p>
                <p className="text-xs text-gray-500">Duration</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-400">{currentTransition.path.points.length}</p>
                <p className="text-xs text-gray-500">Data Points</p>
              </div>
            </div>

            {/* Mini path visualization */}
            <svg viewBox="0 0 400 200" className="w-full h-32 bg-gray-950 rounded">
              <MiniPathView points={currentTransition.path.points} />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniPathView({ points }: { points: { x: number; y: number; time: number }[] }) {
  if (points.length < 2) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 20;
  const w = 400;
  const h = 200;
  const scale = Math.min((w - 2 * pad) / rangeX, (h - 2 * pad) / rangeY);

  const pathData = points
    .map((p, i) => {
      const x = pad + (p.x - minX) * scale;
      const y = pad + (p.y - minY) * scale;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const startX = pad + (points[0].x - minX) * scale;
  const startY = pad + (points[0].y - minY) * scale;
  const endX = pad + (points[points.length - 1].x - minX) * scale;
  const endY = pad + (points[points.length - 1].y - minY) * scale;

  return (
    <>
      <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
      <circle cx={startX} cy={startY} r="5" fill="#ef4444" />
      <circle cx={endX} cy={endY} r="5" fill="#22c55e" />
      <text x={startX + 8} y={startY + 4} fill="#ef4444" fontSize="10" fontFamily="monospace">EXIT</text>
      <text x={endX + 8} y={endY + 4} fill="#22c55e" fontSize="10" fontFamily="monospace">ENTRY</text>
    </>
  );
}
