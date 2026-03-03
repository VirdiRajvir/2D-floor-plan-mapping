'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Props {
  points: { x: number; y: number }[];
  imageWidth: number;
  imageHeight: number;
  /** Reports the current simulation position (normalized 0-1 coords) as the animation runs */
  onPositionUpdate?: (position: { x: number; y: number } | null, isPlaying: boolean) => void;
}

export function TrackingSimulator({ points, imageWidth, imageHeight, onPositionUpdate }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const durationMs = 8000 / speed;  // 8 seconds at 1x speed

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    startTimeRef.current = null;
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (points.length < 2) return;
    setIsPlaying(true);
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp - progress * durationMs;
      const elapsed = timestamp - startTimeRef.current;
      const p = Math.min(elapsed / durationMs, 1);
      setProgress(p);

      if (p < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        stop();
        setProgress(1);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
  }, [points.length, progress, durationMs, stop]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // Reset when points change
  useEffect(() => {
    stop();
    setProgress(0);
  }, [points, stop]);

  const currentPointIndex = Math.min(
    Math.floor(progress * (points.length - 1)),
    points.length - 1
  );
  const currentPoint = points[currentPointIndex];

  // Interpolate between two path points for smooth movement
  const interpolatedPoint = (() => {
    if (points.length < 2) return currentPoint;
    const exactIndex = progress * (points.length - 1);
    const idx = Math.min(Math.floor(exactIndex), points.length - 2);
    const frac = exactIndex - idx;
    const a = points[idx];
    const b = points[Math.min(idx + 1, points.length - 1)];
    return {
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
    };
  })();

  // Emit position updates to parent so the map can render the moving marker
  useEffect(() => {
    if (!onPositionUpdate) return;
    if (isPlaying && interpolatedPoint) {
      onPositionUpdate(interpolatedPoint, true);
    } else if (progress > 0 && progress < 1 && interpolatedPoint) {
      // Paused but mid-route
      onPositionUpdate(interpolatedPoint, false);
    } else if (progress === 0) {
      onPositionUpdate(null, false);
    } else {
      // Completed — show final position briefly
      onPositionUpdate(interpolatedPoint, false);
    }
  }, [isPlaying, interpolatedPoint, progress, onPositionUpdate]);

  return (
    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 space-y-3">
      <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-2">
        <span className="text-sm">📍</span>
        Route Simulation
      </h3>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-400 rounded-full transition-all duration-100"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-cyan-400 rounded-full border-2 border-slate-900 shadow transition-all duration-100"
          style={{ left: `calc(${progress * 100}% - 6px)` }}
        />
      </div>

      {/* Position info */}
      {currentPoint && (
        <p className="text-[10px] text-slate-500 font-mono">
          {progress > 0 && progress < 1
            ? `Pos: (${(currentPoint.x * 100).toFixed(1)}%, ${(currentPoint.y * 100).toFixed(1)}%)`
            : progress === 0 ? 'Ready to simulate' : 'Arrived!'}
        </p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setProgress(0)}
          className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white flex items-center justify-center transition-all text-xs"
          title="Reset"
        >
          ⏮
        </button>

        <button
          onClick={isPlaying ? stop : play}
          disabled={points.length < 2}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            isPlaying
              ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30'
          } disabled:opacity-40`}
        >
          {isPlaying ? '⏸ Pause' : progress > 0 && progress < 1 ? '▶ Resume' : '▶ Simulate Route'}
        </button>

        {/* Speed control */}
        <select
          value={speed}
          onChange={e => { setSpeed(Number(e.target.value)); stop(); }}
          className="bg-slate-700 border border-slate-600 text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none"
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </div>

      <p className="text-[10px] text-slate-600">
        Simulates rescuer movement along the calculated route.
        Real-time tracking will be available in future updates.
      </p>
    </div>
  );
}
