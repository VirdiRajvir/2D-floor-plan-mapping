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
  eps32Point,
  onSetExit,
  onSetEntry,
  onSetEps32,
  label,
  showExit,
  showEntry,
  showEps32,
}: {
  imageUrl: string;
  exitPoint: MarkerPoint | null;
  entryPoint: MarkerPoint | null;
  eps32Point?: MarkerPoint | null;
  onSetExit: (point: MarkerPoint) => void;
  onSetEntry: (point: MarkerPoint) => void;
  onSetEps32?: (point: MarkerPoint) => void;
  label: string;
  showExit: boolean;
  showEntry: boolean;
  showEps32?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<PointMode>(null);
  const [eps32Mode, setEps32Mode] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    if (eps32Mode && onSetEps32 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onSetEps32({ x, y });
      setEps32Mode(false);
      return;
    }
    if (!mode || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (mode === 'exit') {
      onSetExit({ x, y });
    } else if (mode === 'entry') {
      onSetEntry({ x, y });
    }
    setMode(null);
  };

  return (
    <div ref={containerRef} className="relative w-full aspect-video bg-gray-900 rounded-xl overflow-hidden group" onClick={handleClick}>
      <img src={imageUrl} alt="Floor plan" className="w-full h-full object-contain select-none pointer-events-none" />

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

      {/* EPS32 (blue dot) marker */}
      {showEps32 && eps32Point && (
        <div
          className="absolute"
          style={{
            left: `${eps32Point.x}%`,
            top: `${eps32Point.y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-lg" />
        </div>
      )}
      {/* Set Exit button */}
      {showExit && (
        <button
          type="button"
          className="absolute bottom-2 left-2 px-2 py-1 bg-red-700 text-white text-xs rounded shadow hover:bg-red-800"
          onClick={e => { e.stopPropagation(); setMode('exit'); }}
        >
          {mode === 'exit' ? 'Click map to set EXIT' : 'Set Exit'}
        </button>
      )}

      {/* Set Entry button */}
      {showEntry && (
        <button
          type="button"
          className="absolute bottom-10 left-2 px-2 py-1 bg-green-700 text-white text-xs rounded shadow hover:bg-green-800"
          onClick={e => { e.stopPropagation(); setMode('entry'); }}
        >
          {mode === 'entry' ? 'Click map to set ENTRY' : 'Set Entry'}
        </button>
      )}

      {/* Set EPS32 button */}
      {showEps32 && (
        <button
          type="button"
          className="absolute bottom-2 right-2 px-2 py-1 bg-blue-700 text-white text-xs rounded shadow hover:bg-blue-800"
          onClick={(e) => { e.stopPropagation(); setEps32Mode(true); }}
        >
          {eps32Mode ? 'Click map to set EPS32' : 'Set EPS32'}
        </button>
      )}
    </div>
  );
}

export default function TransitionEditor() {
  const {
    transitions,
    floorPlans,
    addTransition,
    removeTransition,
    addTransitionDataset,
    removeTransitionDataset,
    selectTransitionDataset,
    updateTransitionCSV,
    setTransitionPath,
    setExitPoint,
    setEntryPoint,
    setEps32Point,
    isProcessing,
    setIsProcessing,
    selectedTransitionId,
    selectTransition,
  } = useMapStore();

  const [uploadStatus, setUploadStatus] = useState<Record<string, string>>({});
  const [fromRoomId, setFromRoomId] = useState<string>('');
  const [toRoomId, setToRoomId] = useState<string>('');
  const linAccelRef = useRef<HTMLInputElement>(null);
  const gyroRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

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

      const selectedDataset = transition.datasets.find((d) => d.id === transition.selectedDatasetId) ?? transition.datasets[0];
      const statusKey = `${transitionId}:${selectedDataset?.id ?? 'none'}`;
      const { linearAccelerometer, gyroscope } = transition.csvFiles;

      if (!linearAccelerometer || !gyroscope) {
        setUploadStatus((prev) => ({
          ...prev,
          [statusKey]: 'Need both Linear Accelerometer and Gyroscope CSV files',
        }));
        return;
      }

      setIsProcessing(true);
      setUploadStatus((prev) => ({ ...prev, [statusKey]: 'Processing sensor data...' }));

      try {
        const [linAccelData, gyroData] = await Promise.all([
          parseCSVFile(linearAccelerometer),
          parseCSVFile(gyroscope),
        ]);

        const path = calculateTransitionPath(linAccelData, gyroData);
        setTransitionPath(transitionId, path);
        setUploadStatus((prev) => ({
          ...prev,
          [statusKey]: `Processed! Distance: ${path.totalDistance}m, Duration: ${path.duration}s`,
        }));
      } catch (err) {
        console.error('Error processing CSV:', err);
        setUploadStatus((prev) => ({
          ...prev,
          [statusKey]: `Error: ${err instanceof Error ? err.message : 'Processing failed'}`,
        }));
      } finally {
        setIsProcessing(false);
      }
    },
    [transitions, setIsProcessing, setTransitionPath]
  );

  const currentTransition =
    transitions.find((t) => t.id === selectedTransitionId) ?? transitions[0] ?? null;

  const currentDataset = currentTransition
    ? currentTransition.datasets.find((d) => d.id === currentTransition.selectedDatasetId) ?? currentTransition.datasets[0] ?? null
    : null;

  const fromRoom = currentTransition
    ? floorPlans.find((p) => p.id === currentTransition.fromRoomId) ?? null
    : null;
  const toRoom = currentTransition
    ? floorPlans.find((p) => p.id === currentTransition.toRoomId) ?? null
    : null;
  const statusKey = currentTransition && currentDataset
    ? `${currentTransition.id}:${currentDataset.id}`
    : '';

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Configure Connections</h2>
        <p className="text-gray-400">
          Create any room-to-room link and add one or more pathway CSV datasets per connection.
        </p>
      </div>

      {floorPlans.length >= 2 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-white font-medium mb-3">Add Connection</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">From room</label>
              <select
                value={fromRoomId}
                onChange={(e) => setFromRoomId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Select room</option>
                {floorPlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">To room</label>
              <select
                value={toRoomId}
                onChange={(e) => setToRoomId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Select room</option>
                {floorPlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                onClick={() => {
                  const id = addTransition(fromRoomId, toRoomId);
                  if (id) {
                    setFromRoomId('');
                    setToRoomId('');
                    selectTransition(id);
                  }
                }}
                disabled={!fromRoomId || !toRoomId || fromRoomId === toRoomId}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium"
              >
                Add connection
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-center flex-wrap">
        {transitions.map((t) => {
          const from = floorPlans.find((p) => p.id === t.fromRoomId);
          const to = floorPlans.find((p) => p.id === t.toRoomId);
          const selected = currentTransition?.id === t.id;
          return (
            <div key={t.id} className="flex items-center gap-1">
              <button
                onClick={() => selectTransition(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-blue-600 text-white'
                    : t.processed
                    ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {from?.name} → {to?.name} ({t.datasets.length})
                {t.processed && ' ✓'}
              </button>
              <button
                onClick={() => removeTransition(t.id)}
                className="px-2 py-2 rounded-lg bg-gray-800 hover:bg-red-700/40 text-gray-400 hover:text-red-300"
                aria-label="Remove connection"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {!currentTransition && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">No connections yet. Add one above to continue.</p>
        </div>
      )}

      {currentTransition && fromRoom && toRoom && currentDataset && (
        <>
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-medium">Pathway datasets for this connection</h3>
              <button
                onClick={() => addTransitionDataset(currentTransition.id)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                + Add pathway
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {currentTransition.datasets.map((dataset) => (
                <div key={dataset.id} className="flex items-center gap-1">
                  <button
                    onClick={() => selectTransitionDataset(currentTransition.id, dataset.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      currentTransition.selectedDatasetId === dataset.id
                        ? 'bg-blue-600 text-white'
                        : dataset.processed
                        ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {dataset.name}
                    {dataset.processed && ' ✓'}
                  </button>
                  {currentTransition.datasets.length > 1 && (
                    <button
                      onClick={() => removeTransitionDataset(currentTransition.id, dataset.id)}
                      className="px-2 py-1 rounded bg-gray-700 hover:bg-red-700/40 text-gray-400 hover:text-red-300 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ImageMarker
              imageUrl={fromRoom.imageUrl}
              exitPoint={fromRoom.exitPoint}
              entryPoint={fromRoom.entryPoint}
              eps32Point={fromRoom.eps32Point}
              onSetExit={(point) => setExitPoint(fromRoom.id, point)}
              onSetEntry={(point) => setEntryPoint(fromRoom.id, point)}
              onSetEps32={(point) => setEps32Point(fromRoom.id, point)}
              label={`${fromRoom.name} (Exit)`}
              showExit={true}
              showEntry={true}
              showEps32={true}
            />

            <ImageMarker
              imageUrl={toRoom.imageUrl}
              exitPoint={toRoom.exitPoint}
              entryPoint={toRoom.entryPoint}
              eps32Point={toRoom.eps32Point}
              onSetExit={(point) => setExitPoint(toRoom.id, point)}
              onSetEntry={(point) => setEntryPoint(toRoom.id, point)}
              onSetEps32={(point) => setEps32Point(toRoom.id, point)}
              label={`${toRoom.name} (Entry)`}
              showExit={true}
              showEntry={true}
              showEps32={true}
            />
          </div>

          <div className="bg-gray-800 rounded-xl p-6 space-y-4">
            <h3 className="text-white font-medium">Sensor Data for selected pathway</h3>
            <p className="text-gray-400 text-sm">
              Upload a folder of sensor CSVs or individual files for the selected pathway dataset.
            </p>

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

            <div className="flex items-center gap-4">
              <button
                onClick={() => processTransition(currentTransition.id)}
                disabled={isProcessing || !currentTransition.csvFiles.linearAccelerometer || !currentTransition.csvFiles.gyroscope}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium transition-colors"
              >
                {isProcessing ? 'Processing...' : currentTransition.processed ? 'Re-process Data' : 'Process Sensor Data'}
              </button>

              {statusKey && uploadStatus[statusKey] && (
                <span className={`text-sm ${currentTransition.processed ? 'text-green-400' : 'text-yellow-400'}`}>
                  {uploadStatus[statusKey]}
                </span>
              )}
            </div>

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

                <svg viewBox="0 0 400 200" className="w-full h-32 bg-gray-950 rounded">
                  <MiniPathView points={currentTransition.path.points} />
                </svg>
              </div>
            )}
          </div>
        </>
      )}
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
