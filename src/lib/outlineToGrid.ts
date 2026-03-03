/**
 * outlineToGrid.ts
 *
 * Applies floor plan element semantics (doors, restricted zones, balconies)
 * from a detected EnhancedFloorPlanOutline onto a walkability grid, so that
 * A* pathfinding respects these elements:
 *
 *  - Restricted zones / non-passable balconies  → block cells
 *  - Open doors                                 → punch walkable gaps through walls
 *
 * The door punch is self-correcting: if GPT-4o hallucinated a door in open
 * space, the target cell is already `true` (walkable) and is silently skipped.
 */

import type { EnhancedFloorPlanOutline } from './types';
import type { processFloorPlanImage } from './imageProcessor';

type WalkGrid = ReturnType<typeof processFloorPlanImage>;

/** Standard ray-casting point-in-polygon test. */
function pointInPolygon(
  poly: { x: number; y: number }[],
  px: number,
  py: number,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Returns a new WalkGrid with outline semantics applied.
 * The input grid is not mutated.
 */
export function applyOutlineToGrid(
  grid: WalkGrid,
  outline: EnhancedFloorPlanOutline,
): WalkGrid {
  // Deep-copy row arrays so original grid is not mutated
  const newGrid = grid.grid.map(row => [...row]);
  const { rows, cols } = grid;

  // ── 1. Block restricted zones and non-passable balconies ──────────────────
  const blockRegions = [
    ...outline.restrictedZones,
    ...outline.balconies,
  ];

  for (const zone of blockRegions) {
    if (zone.passable) continue;
    if (zone.polygon.length < 3) continue;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nx = cols > 1 ? c / (cols - 1) : 0;
        const ny = rows > 1 ? r / (rows - 1) : 0;
        if (pointInPolygon(zone.polygon, nx, ny)) {
          newGrid[r][c] = false;
        }
      }
    }
  }

  // ── 2. Punch walkable gaps through walls at door locations ────────────────
  for (const door of outline.doors) {
    if (!door.isOpen) continue;

    const dc = Math.round(door.x * (cols - 1));
    const dr = Math.round(door.y * (rows - 1));

    // Self-validating: if the center cell is already walkable, this door was
    // either hallucinated (open space) or already handled — skip it.
    if (newGrid[dr]?.[dc] !== false) continue;

    // Convert normalized door width to grid cells (minimum 1)
    const widthCells = Math.max(1, Math.round(door.width * cols * 0.5));

    // wallNormal 'n'/'s' → wall runs horizontally → punch along columns
    // wallNormal 'e'/'w' → wall runs vertically   → punch along rows
    const horizWall = door.wallNormal === 'n' || door.wallNormal === 's';

    for (let offset = -widthCells; offset <= widthCells; offset++) {
      // 3-cell deep strip to ensure path continuity through the opening
      for (let depth = -1; depth <= 1; depth++) {
        const c = horizWall ? dc + offset : dc + depth;
        const r = horizWall ? dr + depth : dr + offset;
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          newGrid[r][c] = true;
        }
      }
    }
  }

  return { ...grid, grid: newGrid };
}
