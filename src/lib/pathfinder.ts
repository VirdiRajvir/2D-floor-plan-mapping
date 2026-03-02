/**
 * A* Pathfinding on a Walkability Grid
 *
 * Finds the shortest path between two grid cells using the A* algorithm
 * with 8-directional movement (including diagonals).
 */

import type { WalkabilityGrid } from './walkabilityGrid';

export interface GridPoint {
  col: number;
  row: number;
}

/**
 * Find the shortest walkable path between two points on the grid.
 * Returns an array of grid coordinates from start to end (inclusive).
 * Returns empty array if no path exists.
 */
export function findPath(
  wg: WalkabilityGrid,
  start: GridPoint,
  end: GridPoint
): GridPoint[] {
  // Clamp to grid bounds
  const sc = clamp(start.col, 0, wg.cols - 1);
  const sr = clamp(start.row, 0, wg.rows - 1);
  const ec = clamp(end.col, 0, wg.cols - 1);
  const er = clamp(end.row, 0, wg.rows - 1);

  // If start or end is not walkable, find nearest walkable cell
  const actualStart = wg.grid[sr][sc]
    ? { col: sc, row: sr }
    : findNearestWalkable(wg, sc, sr);
  const actualEnd = wg.grid[er][ec]
    ? { col: ec, row: er }
    : findNearestWalkable(wg, ec, er);

  if (!actualStart || !actualEnd) return [];

  // A* implementation
  const key = (c: number, r: number) => r * wg.cols + c;
  const SQRT2 = Math.SQRT2;

  // 8-directional neighbors
  const dirs = [
    [0, -1, 1],  // up
    [0, 1, 1],   // down
    [-1, 0, 1],  // left
    [1, 0, 1],   // right
    [-1, -1, SQRT2], // up-left
    [1, -1, SQRT2],  // up-right
    [-1, 1, SQRT2],  // down-left
    [1, 1, SQRT2],   // down-right
  ];

  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open = new MinHeap();

  const startKey = key(actualStart.col, actualStart.row);
  const endKey = key(actualEnd.col, actualEnd.row);

  gScore.set(startKey, 0);
  fScore.set(startKey, heuristic(actualStart.col, actualStart.row, actualEnd.col, actualEnd.row));
  open.push(startKey, fScore.get(startKey)!);

  const visited = new Set<number>();

  while (open.size() > 0) {
    const currentKey = open.pop()!;
    if (currentKey === endKey) {
      // Reconstruct path
      return reconstructPath(cameFrom, currentKey, wg.cols);
    }

    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    const cr = Math.floor(currentKey / wg.cols);
    const cc = currentKey % wg.cols;

    for (const [dc, dr, cost] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;

      if (nr < 0 || nr >= wg.rows || nc < 0 || nc >= wg.cols) continue;
      if (!wg.grid[nr][nc]) continue;

      // For diagonal movement, ensure both adjacent cardinal cells are also walkable
      // (prevents cutting through wall corners)
      if (dc !== 0 && dr !== 0) {
        if (!wg.grid[cr + dr][cc] || !wg.grid[cr][cc + dc]) continue;
      }

      const nk = key(nc, nr);
      if (visited.has(nk)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + cost;
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, currentKey);
        gScore.set(nk, tentativeG);
        const f = tentativeG + heuristic(nc, nr, actualEnd.col, actualEnd.row);
        fScore.set(nk, f);
        open.push(nk, f);
      }
    }
  }

  return []; // No path found
}

/**
 * Smooth a grid path by removing unnecessary intermediate points.
 * Uses line-of-sight checks to create a more natural-looking path.
 */
export function smoothPath(
  wg: WalkabilityGrid,
  path: GridPoint[]
): GridPoint[] {
  if (path.length <= 2) return path;

  const smoothed: GridPoint[] = [path[0]];
  let current = 0;

  while (current < path.length - 1) {
    // Try to skip ahead as far as possible while maintaining line of sight
    let farthest = current + 1;
    for (let i = path.length - 1; i > current + 1; i--) {
      if (hasLineOfSight(wg, path[current], path[i])) {
        farthest = i;
        break;
      }
    }
    smoothed.push(path[farthest]);
    current = farthest;
  }

  return smoothed;
}

// --- Helpers ---

function heuristic(c1: number, r1: number, c2: number, r2: number): number {
  // Octile distance (diagonal-aware)
  const dc = Math.abs(c1 - c2);
  const dr = Math.abs(r1 - r2);
  return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
}

function reconstructPath(cameFrom: Map<number, number>, endKey: number, cols: number): GridPoint[] {
  const path: GridPoint[] = [];
  let current: number | undefined = endKey;

  while (current !== undefined) {
    const r = Math.floor(current / cols);
    const c = current % cols;
    path.unshift({ col: c, row: r });
    current = cameFrom.get(current);
  }

  return path;
}

function findNearestWalkable(
  wg: WalkabilityGrid,
  col: number,
  row: number
): GridPoint | null {
  // BFS outward to find nearest walkable cell
  const maxDist = 30; // search radius
  for (let d = 1; d <= maxDist; d++) {
    for (let dr = -d; dr <= d; dr++) {
      for (let dc = -d; dc <= d; dc++) {
        if (Math.abs(dr) !== d && Math.abs(dc) !== d) continue; // only check ring
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < wg.rows && nc >= 0 && nc < wg.cols && wg.grid[nr][nc]) {
          return { col: nc, row: nr };
        }
      }
    }
  }
  return null;
}

/**
 * Check if there's a clear line of sight between two grid cells
 * (Bresenham's line algorithm, checking all cells along the line).
 */
function hasLineOfSight(wg: WalkabilityGrid, a: GridPoint, b: GridPoint): boolean {
  let x0 = a.col, y0 = a.row;
  const x1 = b.col, y1 = b.row;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (!wg.grid[y0]?.[x0]) return false;
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }

  return true;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// --- Min Heap for A* open set ---

class MinHeap {
  private items: { key: number; priority: number }[] = [];

  push(key: number, priority: number) {
    this.items.push({ key, priority });
    this._bubbleUp(this.items.length - 1);
  }

  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0].key;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  size(): number {
    return this.items.length;
  }

  private _bubbleUp(i: number) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  private _sinkDown(i: number) {
    const n = this.items.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.items[left].priority < this.items[smallest].priority) smallest = left;
      if (right < n && this.items[right].priority < this.items[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}
