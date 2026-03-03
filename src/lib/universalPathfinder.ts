/**
 * universalPathfinder.ts
 *
 * Computes rescue paths across the full project hierarchy:
 *  - Same floor            → single A* walk segment
 *  - Same building, diff floor → stair-connected 3-segment path
 *  - Different buildings   → exit→transition→entry 3-segment path
 *
 * All grid operations are synchronous and require `floor.walkabilityGrid`
 * to be populated (persisted during setup via processFloorPlanImage).
 */

import { findPath, smoothPath } from './pathfinder';
import { applyOutlineToGrid } from './outlineToGrid';
import type {
  MapProject,
  RescuePathSegment,
  RescueOperation,
  SerializedWalkabilityGrid,
} from './types';
import type { processFloorPlanImage } from './imageProcessor';

type WalkGrid = ReturnType<typeof processFloorPlanImage>;
type Pos = { x: number; y: number };
type Marker = { subMapId: string; floorId: string; x: number; y: number };

function deserializeGrid(s: SerializedWalkabilityGrid): WalkGrid {
  return {
    grid: s.grid,
    rows: s.rows,
    cols: s.cols,
    cellWidth: s.cellW,
    cellHeight: s.cellH,
    imageWidth: s.imageWidth,
    imageHeight: s.imageHeight,
  };
}

function getFloorGrid(
  project: MapProject,
  subMapId: string,
  floorId: string,
): WalkGrid | null {
  const floor = project.subMaps
    .find(s => s.id === subMapId)
    ?.floors.find(f => f.id === floorId);
  if (!floor?.walkabilityGrid) return null;

  let grid = deserializeGrid(floor.walkabilityGrid);

  // Apply AI-detected outline semantics (door gaps, restricted zones, balconies)
  if (
    floor.outline &&
    (floor.outline.doors.length > 0 ||
      floor.outline.restrictedZones.length > 0 ||
      floor.outline.balconies.length > 0)
  ) {
    grid = applyOutlineToGrid(grid, floor.outline);
  }

  // Apply permanent blocked zones
  if (floor.permanentBlockedZones?.length) {
    const data = grid.grid.map(row => [...row]);
    for (const z of floor.permanentBlockedZones) {
      const c1 = Math.max(0, Math.floor(z.x * (grid.cols - 1)));
      const c2 = Math.min(grid.cols - 1, Math.ceil((z.x + z.w) * (grid.cols - 1)));
      const r1 = Math.max(0, Math.floor(z.y * (grid.rows - 1)));
      const r2 = Math.min(grid.rows - 1, Math.ceil((z.y + z.h) * (grid.rows - 1)));
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++)
          data[r][c] = false;
    }
    grid = { ...grid, grid: data };
  }

  return grid;
}

function withBlockedCells(
  grid: WalkGrid,
  subMapId: string,
  floorId: string,
  blocked: RescueOperation['blockedCells'],
): WalkGrid {
  const entry = blocked.find(b => b.subMapId === subMapId && b.floorId === floorId);
  if (!entry?.cells.length) return grid;
  const data = grid.grid.map(row => [...row]);
  for (const { col, row } of entry.cells)
    if (row >= 0 && row < grid.rows && col >= 0 && col < grid.cols)
      data[row][col] = false;
  return { ...grid, grid: data };
}

function walkSegment(
  grid: WalkGrid,
  subMapId: string,
  floorId: string,
  from: Pos,
  to: Pos,
): RescuePathSegment | null {
  const s = {
    col: Math.round(from.x * (grid.cols - 1)),
    row: Math.round(from.y * (grid.rows - 1)),
  };
  const e = {
    col: Math.round(to.x * (grid.cols - 1)),
    row: Math.round(to.y * (grid.rows - 1)),
  };
  const raw = findPath(grid, s, e);
  if (!raw.length) return null;
  const pts = smoothPath(grid, raw);
  const points = pts.map(p => ({
    x: p.col / (grid.cols - 1),
    y: p.row / (grid.rows - 1),
  }));
  let dist = 0;
  for (let i = 1; i < pts.length; i++)
    dist += Math.hypot(pts[i].col - pts[i - 1].col, pts[i].row - pts[i - 1].row) * 0.5;
  return { subMapId, floorId, points, distance: dist, type: 'walk' };
}

export function computeUniversalPath(
  project: MapProject,
  rescuer: Marker,
  rescuee: Marker,
  blockedCells: RescueOperation['blockedCells'],
): RescuePathSegment[] {

  // ── Case 1: same floor ────────────────────────────────────────────────
  if (rescuer.subMapId === rescuee.subMapId && rescuer.floorId === rescuee.floorId) {
    const g = getFloorGrid(project, rescuer.subMapId, rescuer.floorId);
    if (!g) return [];
    const eff = withBlockedCells(g, rescuer.subMapId, rescuer.floorId, blockedCells);
    const seg = walkSegment(eff, rescuer.subMapId, rescuer.floorId, rescuer, rescuee);
    return seg ? [seg] : [];
  }

  // ── Case 2: same building, different floors ───────────────────────────
  if (rescuer.subMapId === rescuee.subMapId) {
    const subMap = project.subMaps.find(s => s.id === rescuer.subMapId);
    const rescuerFloor = subMap?.floors.find(f => f.id === rescuer.floorId);
    const rescueeFloor = subMap?.floors.find(f => f.id === rescuee.floorId);

    // Try stair on rescuer floor pointing to rescuee floor
    let stair = rescuerFloor?.stairConnections.find(
      sc => sc.toFloorId === rescuee.floorId
    );

    // Try reverse: stair on rescuee floor pointing back to rescuer floor
    if (!stair) {
      const rev = rescueeFloor?.stairConnections.find(
        sc => sc.toFloorId === rescuer.floorId
      );
      if (rev) {
        stair = {
          ...rev,
          fromFloorId: rev.toFloorId,
          toFloorId: rev.fromFloorId,
          fromPosition: rev.toPosition,
          toPosition: rev.fromPosition,
        };
      }
    }

    if (!stair) return [];

    const gA = getFloorGrid(project, rescuer.subMapId, rescuer.floorId);
    const gB = getFloorGrid(project, rescuee.subMapId, rescuee.floorId);
    if (!gA || !gB) return [];

    const effA = withBlockedCells(gA, rescuer.subMapId, rescuer.floorId, blockedCells);
    const effB = withBlockedCells(gB, rescuee.subMapId, rescuee.floorId, blockedCells);

    const s1 = walkSegment(effA, rescuer.subMapId, rescuer.floorId, rescuer, stair.fromPosition);
    const s2: RescuePathSegment = {
      subMapId: rescuer.subMapId,
      floorId: rescuee.floorId,
      points: [stair.fromPosition, stair.toPosition],
      distance: 3,
      type: 'stairs',
    };
    const s3 = walkSegment(effB, rescuee.subMapId, rescuee.floorId, stair.toPosition, rescuee);

    return [s1, s2, s3].filter((x): x is RescuePathSegment => x !== null);
  }

  // ── Case 3: different buildings ───────────────────────────────────────
  // Requires manually placed or AI-detected entry/exit points (MarkerPoint = 0-100%)
  const rFloor = project.subMaps
    .find(s => s.id === rescuer.subMapId)
    ?.floors.find(f => f.id === rescuer.floorId);
  const eFloor = project.subMaps
    .find(s => s.id === rescuee.subMapId)
    ?.floors.find(f => f.id === rescuee.floorId);

  if (!rFloor?.exitPoints.length || !eFloor?.entryPoints.length) return [];

  const nearest = <T extends { x: number; y: number }>(
    pts: T[],
    ref: Pos,
    scale = 1,
  ): T =>
    pts.reduce((best, p) =>
      Math.hypot(p.x / scale - ref.x, p.y / scale - ref.y) <
      Math.hypot(best.x / scale - ref.x, best.y / scale - ref.y)
        ? p
        : best
    );

  const exitPt = nearest(rFloor.exitPoints, rescuer, 100);
  const entryPt = nearest(eFloor.entryPoints, rescuee, 100);
  const exitNorm: Pos = { x: exitPt.x / 100, y: exitPt.y / 100 };
  const entryNorm: Pos = { x: entryPt.x / 100, y: entryPt.y / 100 };

  const gA = getFloorGrid(project, rescuer.subMapId, rescuer.floorId);
  const gB = getFloorGrid(project, rescuee.subMapId, rescuee.floorId);
  if (!gA || !gB) return [];

  const effA = withBlockedCells(gA, rescuer.subMapId, rescuer.floorId, blockedCells);
  const effB = withBlockedCells(gB, rescuee.subMapId, rescuee.floorId, blockedCells);

  const s1 = walkSegment(effA, rescuer.subMapId, rescuer.floorId, rescuer, exitNorm);
  const s2: RescuePathSegment = {
    subMapId: rescuer.subMapId,
    floorId: rescuer.floorId,
    points: [exitNorm, entryNorm],
    distance: 20,
    type: 'transition',
  };
  const s3 = walkSegment(effB, rescuee.subMapId, rescuee.floorId, entryNorm, rescuee);

  return [s1, s2, s3].filter((x): x is RescuePathSegment => x !== null);
}
