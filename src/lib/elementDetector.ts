/**
 * Floor Plan Element Detector
 *
 * Detects walls, doors, windows, balconies, restricted zones, and stairs
 * from a 2D floor plan image. Uses GPT-4o vision when an API key is provided,
 * otherwise falls back to brightness threshold analysis.
 */

import type {
  EnhancedFloorPlanOutline,
  DoorElement,
  WindowElement,
  RegionElement,
} from './types';
import type { WallSegment } from './floorplanExtractor';

const DETECTION_PROMPT = `You are an expert architectural floor plan analyzer. Analyze this floor plan image and extract ALL physical structural and spatial elements with precise coordinates.

Return a JSON object with these exact fields:

1. **walls** — Array of wall segments as line segments:
   [{x1, y1, x2, y2}] — all coordinates normalized 0.0–1.0

2. **doors** — Array of door elements:
   [{id, x, y, wallNormal, width, isOpen}]
   - x, y = center of door opening (normalized 0–1)
   - wallNormal = which direction the wall runs: "n", "s", "e", "w"
   - width = door width normalized 0–1
   - isOpen = true if shown open (has swing arc), false if closed

3. **windows** — Array of windows on walls:
   [{id, x1, y1, x2, y2}] — the window span along the wall (normalized)

4. **balconies** — Outdoor attached areas (terraces, balconies, external walkways):
   [{id, type: "balcony", polygon: [{x,y},...], label, passable: false}]

5. **restrictedZones** — No-entry areas (server rooms, machinery, vaults, hazardous areas):
   [{id, type: "restricted", polygon: [{x,y},...], label, passable: false}]

6. **stairs** — Stairwells and escalators:
   [{id, type: "stair", polygon: [{x,y},...], label, passable: true}]

7. **corridors** — Main walkable corridors/hallways:
   [{id, type: "corridor", polygon: [{x,y},...], label, passable: true}]

8. **outerBoundary** — The outer wall perimeter polygon:
   [{x, y},...] clockwise from top-left

9. **rooms** — Every labeled room/area:
   [{id, label, center: {x,y}, doorPosition: {x,y}}]
   - label = the text visible in the image (room name or number)
   - doorPosition = where the door opening is

CRITICAL RULES:
- ALL coordinates normalized 0.0–1.0 (0,0 = top-left, 1,1 = bottom-right)
- walls = solid dark lines that form boundaries between spaces
- doors = gaps in walls, often shown with a swing arc (quarter circle)
- windows = dashed lines on exterior walls, typically shown with double lines
- balconies = hatched or textured outdoor areas attached to the building
- restrictedZones = areas marked with X, diagonal lines, or special symbols
- stairs = areas with parallel diagonal lines or step symbols
- Return ONLY valid JSON, no explanation text

Return ONLY this JSON structure:
{
  "walls": [...],
  "doors": [...],
  "windows": [...],
  "balconies": [...],
  "restrictedZones": [...],
  "stairs": [...],
  "corridors": [...],
  "outerBoundary": [...],
  "rooms": [...]
}`;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function parseNorm(v: unknown): number {
  return clamp(Number(v ?? 0), 0, 1);
}

function generateId(prefix: string, i: number): string {
  return `${prefix}_${i}_${Math.random().toString(36).slice(2, 7)}`;
}

function parsePoint(p: unknown): { x: number; y: number } | null {
  if (!p || typeof p !== 'object') return null;
  const pt = p as Record<string, unknown>;
  const x = parseNorm(pt.x);
  const y = parseNorm(pt.y);
  if (isNaN(x) || isNaN(y)) return null;
  return { x, y };
}

function parsePolygon(arr: unknown): { x: number; y: number }[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(parsePoint).filter(Boolean) as { x: number; y: number }[];
}

function validateEnhancedOutline(data: unknown): EnhancedFloorPlanOutline | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  // Parse walls
  const walls: WallSegment[] = [];
  if (Array.isArray(d.walls)) {
    for (let i = 0; i < d.walls.length; i++) {
      const w = d.walls[i] as Record<string, unknown>;
      if (!w) continue;
      const seg: WallSegment = {
        x1: parseNorm(w.x1), y1: parseNorm(w.y1),
        x2: parseNorm(w.x2), y2: parseNorm(w.y2),
        thickness: 3,
      };
      const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
      if (len > 0.003 && !isNaN(seg.x1)) walls.push(seg);
    }
  }

  // Parse doors
  const doors: DoorElement[] = [];
  if (Array.isArray(d.doors)) {
    for (let i = 0; i < d.doors.length; i++) {
      const dr = d.doors[i] as Record<string, unknown>;
      if (!dr) continue;
      doors.push({
        id: String(dr.id ?? generateId('door', i)),
        x: parseNorm(dr.x),
        y: parseNorm(dr.y),
        wallNormal: (['n','s','e','w'].includes(String(dr.wallNormal)) ? String(dr.wallNormal) : 'n') as 'n'|'s'|'e'|'w',
        width: Math.max(0.01, parseNorm(dr.width)),
        isOpen: Boolean(dr.isOpen ?? true),
        linkedRoomIds: Array.isArray(dr.linkedRoomIds) ? dr.linkedRoomIds.map(String) : [],
      });
    }
  }

  // Parse windows
  const windows: WindowElement[] = [];
  if (Array.isArray(d.windows)) {
    for (let i = 0; i < d.windows.length; i++) {
      const wn = d.windows[i] as Record<string, unknown>;
      if (!wn) continue;
      windows.push({
        id: String(wn.id ?? generateId('win', i)),
        x1: parseNorm(wn.x1), y1: parseNorm(wn.y1),
        x2: parseNorm(wn.x2), y2: parseNorm(wn.y2),
      });
    }
  }

  // Parse region arrays
  function parseRegions(arr: unknown, type: RegionElement['type']): RegionElement[] {
    if (!Array.isArray(arr)) return [];
    return arr.map((r: unknown, i: number) => {
      const reg = r as Record<string, unknown>;
      const poly = parsePolygon(reg?.polygon);
      if (poly.length < 3) return null;
      return {
        id: String(reg?.id ?? generateId(type, i)),
        type,
        polygon: poly,
        label: reg?.label ? String(reg.label) : undefined,
        passable: Boolean(reg?.passable ?? (type === 'stair' || type === 'corridor')),
      } as RegionElement;
    }).filter(Boolean) as RegionElement[];
  }

  const balconies = parseRegions(d.balconies, 'balcony');
  const restrictedZones = parseRegions(d.restrictedZones, 'restricted');
  const stairs = parseRegions(d.stairs, 'stair');
  const corridors = parseRegions(d.corridors, 'corridor');

  // Parse outer boundary
  const outerBoundary = parsePolygon(d.outerBoundary);

  // Parse rooms
  const rooms: EnhancedFloorPlanOutline['rooms'] = [];
  if (Array.isArray(d.rooms)) {
    for (let i = 0; i < d.rooms.length; i++) {
      const rm = d.rooms[i] as Record<string, unknown>;
      if (!rm) continue;
      const center = parsePoint(rm.center);
      const door = parsePoint(rm.doorPosition);
      if (center && door) {
        rooms.push({
          id: String(rm.id ?? generateId('room', i)),
          label: String(rm.label ?? `Room ${i + 1}`),
          center,
          doorPosition: door,
        });
      }
    }
  }

  if (walls.length === 0 && outerBoundary.length < 3 && rooms.length === 0) {
    return null;
  }

  return {
    walls,
    doors,
    windows,
    balconies,
    restrictedZones,
    stairs,
    corridors,
    outerBoundary,
    rooms,
    width: 900,
    height: 750,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sharp-based brightness mask helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BrightnessMask {
  mask: Uint8Array;  // 0 = dark/wall, 255 = bright/walkable
  w: number;
  h: number;
}

/**
 * Build a per-pixel brightness mask from the image buffer using Sharp.
 * Threshold: pixels darker than 128 are considered walls (0), brighter are walkable (255).
 */
async function buildBrightnessMask(buf: Buffer, mime: string): Promise<BrightnessMask> {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(buf)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    mask[i] = data[i] > 128 ? 255 : 0;
  }
  return { mask, w: info.width, h: info.height };
}

/**
 * Returns true if >20% of pixels within `radius` px of the normalized point (nx, ny) are dark.
 * Used to confirm a door or window is in a wall context (some dark pixels nearby).
 */
function hasDarkContext(
  mask: Uint8Array, w: number, h: number,
  nx: number, ny: number, radius = 8,
): boolean {
  const cx = Math.round(nx * (w - 1));
  const cy = Math.round(ny * (h - 1));
  let dark = 0, total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = Math.max(0, Math.min(w - 1, cx + dx));
      const py = Math.max(0, Math.min(h - 1, cy + dy));
      if (mask[py * w + px] === 0) dark++;
      total++;
    }
  }
  return dark / total > 0.20;
}

/**
 * Returns true if >40% of 20 sampled points along the normalized line segment are dark.
 * Used to confirm a wall segment runs through actual dark pixels.
 */
function isDarkLine(
  mask: Uint8Array, w: number, h: number,
  x1: number, y1: number, x2: number, y2: number,
): boolean {
  const steps = 20;
  let dark = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = Math.round((x1 + (x2 - x1) * t) * (w - 1));
    const py = Math.round((y1 + (y2 - y1) * t) * (h - 1));
    const spx = Math.max(0, Math.min(w - 1, px));
    const spy = Math.max(0, Math.min(h - 1, py));
    if (mask[spy * w + spx] === 0) dark++;
  }
  return dark / (steps + 1) > 0.40;
}

/**
 * Filter an extracted outline by cross-validating coordinates against the brightness mask.
 * Elements whose coordinates don't correspond to expected image features are removed.
 */
function filterByMask(
  outline: EnhancedFloorPlanOutline,
  mask: Uint8Array, w: number, h: number,
): EnhancedFloorPlanOutline {
  // Walls: must run along dark pixels
  const walls = outline.walls.filter(wall =>
    isDarkLine(mask, w, h, wall.x1, wall.y1, wall.x2, wall.y2)
  );

  // Doors: must be near dark pixels (wall context)
  const doors = outline.doors.filter(door =>
    hasDarkContext(mask, w, h, door.x, door.y)
  );

  // Windows: the line span must have dark context at both endpoints
  const windows = outline.windows.filter(win =>
    hasDarkContext(mask, w, h, win.x1, win.y1) ||
    hasDarkContext(mask, w, h, win.x2, win.y2)
  );

  // Restricted zones: centroid must have dark context (verify it's a real region)
  const restrictedZones = outline.restrictedZones.filter(zone => {
    if (zone.polygon.length === 0) return false;
    const cx = zone.polygon.reduce((s, p) => s + p.x, 0) / zone.polygon.length;
    const cy = zone.polygon.reduce((s, p) => s + p.y, 0) / zone.polygon.length;
    return hasDarkContext(mask, w, h, cx, cy, 12);
  });

  // Balconies, stairs, corridors: keep as-is (polygons harder to validate cheaply)
  return {
    ...outline,
    walls,
    doors,
    windows,
    restrictedZones,
  };
}

/**
 * Basic wall/door detection using Sharp brightness analysis — no LLM required.
 * Scans horizontal and vertical dark pixel runs to identify walls, then looks
 * for gaps (bright breaks) in those runs to identify potential door openings.
 */
async function detectWallsWithSharp(
  mask: Uint8Array, w: number, h: number,
): Promise<EnhancedFloorPlanOutline> {
  const walls: WallSegment[] = [];
  const doors: DoorElement[] = [];

  const MIN_WALL_LEN_FRAC = 0.03; // run must be ≥ 3% of image dimension to be a wall
  const MIN_DOOR_GAP_FRAC = 0.01; // gap must be ≥ 1% of image dimension to be a door
  const minWallH = Math.round(w * MIN_WALL_LEN_FRAC);
  const minWallV = Math.round(h * MIN_WALL_LEN_FRAC);
  const minDoorH = Math.round(w * MIN_DOOR_GAP_FRAC);
  const minDoorV = Math.round(h * MIN_DOOR_GAP_FRAC);

  let doorIdx = 0;

  // ── Horizontal wall detection (scan each row) ────────────────────────────
  for (let row = 0; row < h; row++) {
    let runStart = -1;
    let gapStart = -1;
    let lastWallEnd = -1;

    for (let col = 0; col <= w; col++) {
      const dark = col < w && mask[row * w + col] === 0;

      if (dark) {
        if (runStart === -1) runStart = col;
        // Check if there was a gap (possible door) after a previous wall run
        if (gapStart !== -1 && lastWallEnd !== -1) {
          const gapLen = col - gapStart;
          if (gapLen >= minDoorH && gapLen <= w * 0.15) {
            // Gap in wall → door
            doors.push({
              id: `cv_door_h_${doorIdx++}`,
              x: ((gapStart + col) / 2) / (w - 1),
              y: row / (h - 1),
              wallNormal: 'n',
              width: gapLen / w,
              isOpen: true,
            });
          }
          gapStart = -1;
        }
      } else {
        if (runStart !== -1) {
          const runLen = col - runStart;
          if (runLen >= minWallH) {
            walls.push({
              x1: runStart / (w - 1), y1: row / (h - 1),
              x2: (col - 1) / (w - 1), y2: row / (h - 1),
              thickness: 2,
            });
            lastWallEnd = col - 1;
            gapStart = col; // start tracking gap after wall
          }
          runStart = -1;
        }
      }
    }
  }

  // ── Vertical wall detection (scan each column) ───────────────────────────
  for (let col = 0; col < w; col++) {
    let runStart = -1;
    let gapStart = -1;
    let lastWallEnd = -1;

    for (let row = 0; row <= h; row++) {
      const dark = row < h && mask[row * w + col] === 0;

      if (dark) {
        if (runStart === -1) runStart = row;
        if (gapStart !== -1 && lastWallEnd !== -1) {
          const gapLen = row - gapStart;
          if (gapLen >= minDoorV && gapLen <= h * 0.15) {
            doors.push({
              id: `cv_door_v_${doorIdx++}`,
              x: col / (w - 1),
              y: ((gapStart + row) / 2) / (h - 1),
              wallNormal: 'e',
              width: gapLen / h,
              isOpen: true,
            });
          }
          gapStart = -1;
        }
      } else {
        if (runStart !== -1) {
          const runLen = row - runStart;
          if (runLen >= minWallV) {
            walls.push({
              x1: col / (w - 1), y1: runStart / (h - 1),
              x2: col / (w - 1), y2: (row - 1) / (h - 1),
              thickness: 2,
            });
            lastWallEnd = row - 1;
            gapStart = row;
          }
          runStart = -1;
        }
      }
    }
  }

  // Deduplicate walls that are too close to each other (same row/col repeated)
  // Keep only every 4th horizontal wall run to avoid repetition from neighbouring rows
  const dedupedWalls = walls.filter((_, i) => i % 4 === 0);

  return {
    walls: dedupedWalls,
    doors,
    windows: [],
    balconies: [],
    restrictedZones: [],
    stairs: [],
    corridors: [],
    outerBoundary: [],
    rooms: [],
    width: w,
    height: h,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect floor plan elements using GPT-4o vision.
 * Always builds a brightness mask first (using Sharp) to validate/filter
 * GPT-4o coordinate output. Falls back to Sharp CV detection when no API key.
 */
export async function detectFloorPlanElements(
  imageBuffer: Buffer,
  mimeType: string,
  apiKey?: string,
): Promise<EnhancedFloorPlanOutline> {

  // Always build brightness mask — used for validation and/or CV fallback
  let brightnessMask: BrightnessMask | null = null;
  try {
    brightnessMask = await buildBrightnessMask(imageBuffer, mimeType);
  } catch (err) {
    console.warn('[ElementDetector] Sharp brightness mask failed:', err);
  }

  // If no API key, use Sharp CV detection instead of returning empty outline
  if (!apiKey) {
    if (brightnessMask) {
      try {
        const cvOutline = await detectWallsWithSharp(
          brightnessMask.mask, brightnessMask.w, brightnessMask.h,
        );
        console.log(`[ElementDetector] CV fallback: ${cvOutline.walls.length} walls, ${cvOutline.doors.length} doors`);
        return cvOutline;
      } catch (err) {
        console.warn('[ElementDetector] CV wall detection failed:', err);
      }
    }
    return {
      walls: [], doors: [], windows: [],
      balconies: [], restrictedZones: [], stairs: [], corridors: [],
      outerBoundary: [],
      rooms: [],
      width: 900, height: 750,
    };
  }

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const imageBase64 = imageBuffer.toString('base64');

  let bestResult: EnhancedFloorPlanOutline | null = null;

  for (let pass = 1; pass <= 2; pass++) {
    let prompt = DETECTION_PROMPT;
    if (pass === 2 && bestResult) {
      prompt += `\n\nPREVIOUS EXTRACTION (review and correct):\n${JSON.stringify(bestResult, null, 2)}\n\nFix any inaccuracies. Pay special attention to missing doors, incorrect wall positions, and any balconies or restricted areas you missed.`;
    }

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 16000,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
            { type: 'text', text: prompt },
          ],
        }],
      });

      const content = response.choices[0]?.message?.content ?? '';
      let jsonStr = content.trim();

      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();

      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end > start) jsonStr = jsonStr.substring(start, end + 1);

      const parsed = JSON.parse(jsonStr);
      let validated = validateEnhancedOutline(parsed);
      if (validated) {
        // Cross-validate GPT-4o coordinates against actual image pixels
        if (brightnessMask) {
          validated = filterByMask(
            validated, brightnessMask.mask, brightnessMask.w, brightnessMask.h,
          );
        }
        bestResult = validated;
        console.log(`[ElementDetector] Pass ${pass}: ${validated.walls.length} walls, ${validated.doors.length} doors, ${validated.windows.length} windows`);
      }
    } catch (err) {
      console.warn(`[ElementDetector] Pass ${pass} failed:`, err);
    }
  }

  if (!bestResult) {
    // GPT-4o failed — fall back to CV detection
    if (brightnessMask) {
      try {
        return await detectWallsWithSharp(
          brightnessMask.mask, brightnessMask.w, brightnessMask.h,
        );
      } catch { /* ignore */ }
    }
    return {
      walls: [], doors: [], windows: [],
      balconies: [], restrictedZones: [], stairs: [], corridors: [],
      outerBoundary: [],
      rooms: [],
      width: 900, height: 750,
    };
  }

  return bestResult;
}
