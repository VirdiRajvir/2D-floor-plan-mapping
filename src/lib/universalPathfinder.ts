/**
 * universalPathfinder.ts
 *
 * Computes rescue paths across the full project hierarchy:
 *  - Same floor              → single A* walk segment
 *  - Same building, diff floor → stair-connected 3-segment path
 *  - Different buildings      → exit→master map walk→entry multi-segment path
 *  - Master map ↔ sub-map     → mixed master/sub-map path
 *  - Both on master map       → straight line on master map
 *
 * Master-map segments use subMapId='master' & floorId='master' as a convention.
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

/** Sentinel values for markers placed on the master map */
export const MASTER_MAP_ID = 'master';

function isMasterMarker(m: Marker): boolean {
  return m.subMapId === MASTER_MAP_ID;
}

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

/** Create a walk segment on the master map — A* if grid available, else straight line */
function masterMapSegment(
  from: Pos,
  to: Pos,
  masterW: number,
  masterH: number,
  grid: WalkGrid | null,
): RescuePathSegment {
  // Try A* pathfinding on the master map grid
  if (grid) {
    const seg = walkSegment(grid, MASTER_MAP_ID, MASTER_MAP_ID, from, to);
    if (seg) return seg;
    // A* failed (no path) — fall back to straight line
  }
  // Straight-line fallback
  const dist = Math.hypot((to.x - from.x) * masterW, (to.y - from.y) * masterH) * 0.3;
  return {
    subMapId: MASTER_MAP_ID,
    floorId: MASTER_MAP_ID,
    points: [from, to],
    distance: Math.max(dist, 5),
    type: 'walk',
  };
}

/** Get the master map walkability grid.
 *  Builds an all-walkable grid then carves out manually-drawn red zones.
 *  If a pre-computed grid is stored (from image processing), use that as the
 *  base and apply red zones on top. */
function getMasterGrid(project: MapProject): WalkGrid | null {
  const mm = project.masterMap;
  const mw = mm.width || 800;
  const mh = mm.height || 600;

  // Determine grid dimensions — use stored grid dims or default 150 cells
  const GRID_RES = 150;
  const aspect = mw / mh;
  let cols: number, rows: number;
  if (aspect >= 1) { cols = GRID_RES; rows = Math.max(10, Math.round(GRID_RES / aspect)); }
  else { rows = GRID_RES; cols = Math.max(10, Math.round(GRID_RES * aspect)); }

  // Start with a base grid (all walkable or from stored image-processed grid)
  let data: boolean[][];
  if (mm.walkabilityGrid) {
    const base = deserializeGrid(mm.walkabilityGrid);
    data = base.grid.map(row => [...row]);
    cols = base.cols;
    rows = base.rows;
  } else {
    // All walkable base — only red zones define obstacles
    data = Array.from({ length: rows }, () => Array(cols).fill(true));
  }

  // Carve out permanent blocked zones (red zones)
  if (mm.permanentBlockedZones?.length) {
    for (const z of mm.permanentBlockedZones) {
      const c1 = Math.max(0, Math.floor(z.x * (cols - 1)));
      const c2 = Math.min(cols - 1, Math.ceil((z.x + z.w) * (cols - 1)));
      const r1 = Math.max(0, Math.floor(z.y * (rows - 1)));
      const r2 = Math.min(rows - 1, Math.ceil((z.y + z.h) * (rows - 1)));
      for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++)
          data[r][c] = false;
    }
  }

  // Only return a grid if there are actual blocked zones — otherwise
  // a fully-walkable grid just produces the same result as a straight line
  // but with unnecessary A* overhead.
  if (!mm.permanentBlockedZones?.length && !mm.walkabilityGrid) return null;

  const cellW = mw / cols;
  const cellH = mh / rows;
  return { grid: data, rows, cols, cellWidth: cellW, cellHeight: cellH, imageWidth: mw, imageHeight: mh };
}

/** Find the pin on the master map that links to a given subMapId */
function findPinForSubMap(project: MapProject, subMapId: string): Pos | null {
  const pin = project.masterMap.pins.find(p => p.subMapId === subMapId);
  return pin ? { x: pin.x, y: pin.y } : null;
}

/** Nearest helper */
function nearest<T extends { x: number; y: number }>(
  pts: T[],
  ref: Pos,
  scale = 1,
): T {
  return pts.reduce((best, p) =>
    Math.hypot(p.x / scale - ref.x, p.y / scale - ref.y) <
    Math.hypot(best.x / scale - ref.x, best.y / scale - ref.y)
      ? p
      : best
  );
}

/**
 * Build segments to go from inside a sub-map to a master map position.
 * Returns: [walk to exit, transition out] or empty if no exit points.
 */
function segmentsFromSubToMaster(
  project: MapProject,
  marker: Marker,
  masterPos: Pos,
  blockedCells: RescueOperation['blockedCells'],
): RescuePathSegment[] {
  const floor = project.subMaps
    .find(s => s.id === marker.subMapId)
    ?.floors.find(f => f.id === marker.floorId);
  const grid = getFloorGrid(project, marker.subMapId, marker.floorId);

  // If we have exit points and a walkability grid, route to the exit
  if (floor?.exitPoints.length && grid) {
    const exitPt = nearest(floor.exitPoints, marker, 100);
    const exitNorm: Pos = { x: exitPt.x / 100, y: exitPt.y / 100 };
    const eff = withBlockedCells(grid, marker.subMapId, marker.floorId, blockedCells);
    const walkSeg = walkSegment(eff, marker.subMapId, marker.floorId, marker, exitNorm);
    const transitionSeg: RescuePathSegment = {
      subMapId: marker.subMapId,
      floorId: marker.floorId,
      points: [exitNorm, masterPos],
      distance: 5,
      type: 'transition',
    };
    return walkSeg ? [walkSeg, transitionSeg] : [transitionSeg];
  }

  // No exit points — use building center as exit, skip walk
  const transitionSeg: RescuePathSegment = {
    subMapId: marker.subMapId,
    floorId: marker.floorId,
    points: [marker, masterPos],
    distance: 5,
    type: 'transition',
  };
  return [transitionSeg];
}

/**
 * Build segments to go from a master map position into a sub-map.
 * Returns: [transition in, walk from entry] or empty if no entry points.
 */
function segmentsFromMasterToSub(
  project: MapProject,
  masterPos: Pos,
  marker: Marker,
  blockedCells: RescueOperation['blockedCells'],
): RescuePathSegment[] {
  const floor = project.subMaps
    .find(s => s.id === marker.subMapId)
    ?.floors.find(f => f.id === marker.floorId);
  const grid = getFloorGrid(project, marker.subMapId, marker.floorId);

  // If we have entry points and a walkability grid, route from entry
  if (floor?.entryPoints.length && grid) {
    const entryPt = nearest(floor.entryPoints, marker, 100);
    const entryNorm: Pos = { x: entryPt.x / 100, y: entryPt.y / 100 };
    const eff = withBlockedCells(grid, marker.subMapId, marker.floorId, blockedCells);
    const transitionSeg: RescuePathSegment = {
      subMapId: marker.subMapId,
      floorId: marker.floorId,
      points: [masterPos, entryNorm],
      distance: 5,
      type: 'transition',
    };
    const walkSeg = walkSegment(eff, marker.subMapId, marker.floorId, entryNorm, marker);
    return walkSeg ? [transitionSeg, walkSeg] : [transitionSeg];
  }

  // No entry points — direct transition
  const transitionSeg: RescuePathSegment = {
    subMapId: marker.subMapId,
    floorId: marker.floorId,
    points: [masterPos, marker],
    distance: 5,
    type: 'transition',
  };
  return [transitionSeg];
}

export function computeUniversalPath(
  project: MapProject,
  rescuer: Marker,
  rescuee: Marker,
  blockedCells: RescueOperation['blockedCells'],
): RescuePathSegment[] {
  const rescuerOnMaster = isMasterMarker(rescuer);
  const rescueeOnMaster = isMasterMarker(rescuee);
  const mw = project.masterMap.width || 800;
  const mh = project.masterMap.height || 600;
  const masterGrid = getMasterGrid(project);

  // ── Case 0: both on master map ────────────────────────────────────────
  if (rescuerOnMaster && rescueeOnMaster) {
    return [masterMapSegment(rescuer, rescuee, mw, mh, masterGrid)];
  }

  // ── Case 0a: rescuer on master, rescuee in sub-map ────────────────────
  if (rescuerOnMaster && !rescueeOnMaster) {
    const rescueePinPos = findPinForSubMap(project, rescuee.subMapId);
    if (!rescueePinPos) return [];
    const masterSeg = masterMapSegment(rescuer, rescueePinPos, mw, mh, masterGrid);
    const entrySegs = segmentsFromMasterToSub(project, rescueePinPos, rescuee, blockedCells);
    return [masterSeg, ...entrySegs];
  }

  // ── Case 0b: rescuee on master, rescuer in sub-map ────────────────────
  if (!rescuerOnMaster && rescueeOnMaster) {
    const rescuerPinPos = findPinForSubMap(project, rescuer.subMapId);
    if (!rescuerPinPos) return [];
    const exitSegs = segmentsFromSubToMaster(project, rescuer, rescuerPinPos, blockedCells);
    const masterSeg = masterMapSegment(rescuerPinPos, rescuee, mw, mh, masterGrid);
    return [...exitSegs, masterSeg];
  }

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

  // ── Case 3: different buildings — full cross-building route ────────────
  // Route: sub-map A exit → master map walk → sub-map B entry
  const rescuerPinPos = findPinForSubMap(project, rescuer.subMapId);
  const rescueePinPos = findPinForSubMap(project, rescuee.subMapId);
  if (!rescuerPinPos || !rescueePinPos) return [];

  const exitSegs = segmentsFromSubToMaster(project, rescuer, rescuerPinPos, blockedCells);
  const masterWalk = masterMapSegment(rescuerPinPos, rescueePinPos, mw, mh, masterGrid);
  const entrySegs = segmentsFromMasterToSub(project, rescueePinPos, rescuee, blockedCells);

  return [...exitSegs, masterWalk, ...entrySegs];
}
