/**
 * FloorPlan Outline Extractor
 * 
 * Takes a floor plan image and returns a clean outline representation
 * with only walls (lines) and obstacles/furniture (filled rectangles).
 * Uses OpenAI GPT-4o vision for structural analysis.
 */

export interface WallSegment {
  x1: number; // 0-1 normalized
  y1: number;
  x2: number;
  y2: number;
  thickness: number; // in output pixels
}

export interface ObstacleBlock {
  x: number;      // 0-1 normalized, top-left
  y: number;
  width: number;   // 0-1 normalized
  height: number;
  rotation?: number; // degrees
  label?: string;    // optional, for debugging
}

export interface FloorPlanOutline {
  walls: WallSegment[];
  obstacles: ObstacleBlock[];
  outerBoundary: { x: number; y: number }[]; // polygon points, 0-1 normalized
  width: number;   // output canvas width
  height: number;  // output canvas height
}

export interface ExtractorOptions {
  outputWidth?: number;
  outputHeight?: number;
  wallThickness?: number;
  apiKey: string;
  model?: string;
  /** Number of analysis passes for accuracy (1-3) */
  passes?: number;
}

const DEFAULT_OPTIONS: Omit<ExtractorOptions, 'apiKey'> = {
  outputWidth: 900,
  outputHeight: 750,
  wallThickness: 3,
  model: 'gpt-4o',
  passes: 2,
};

/**
 * The core extraction prompt. Very specific about what we want:
 * pure geometry, no labels, no interpretation.
 */
function buildExtractionPrompt(pass: number, previousResult?: FloorPlanOutline): string {
  const base = `You are a precise architectural geometry extractor. Analyze this floor plan image and extract ONLY the physical structural elements as geometric primitives.

TASK: Return a JSON object describing the floor plan with ONLY:
1. **outerBoundary** — The outer wall perimeter as a polygon. Return an array of {x, y} points (normalized 0.0 to 1.0 relative to image dimensions) tracing the outer walls. Start from top-left and go clockwise.
2. **walls** — Interior wall segments as line segments. Each has {x1, y1, x2, y2} normalized 0-1. Include ALL interior walls, partition walls, and structural walls visible in the image.
3. **obstacles** — Furniture, desks, tables, equipment, and any solid objects as rectangles. Each has {x, y, width, height} normalized 0-1 where x,y is top-left corner. These should be the BLACK FILLED rectangles in the output.

CRITICAL RULES:
- ALL coordinates are normalized 0.0 to 1.0 (0,0 = top-left of image, 1,1 = bottom-right)
- IGNORE all text, labels, annotations, arrows, measurements, and dimensions
- IGNORE door swing arcs and door symbols
- DO include door openings as gaps in walls
- Obstacles should capture desks, tables, shelving units, large equipment — anything that would be a solid black rectangle in a simplified view
- For rows of identical furniture (like rows of desks), represent EACH individual piece as a separate obstacle
- Walls should be line segments, not rectangles
- Be EXTREMELY precise with coordinates. Measure carefully against the image grid.
- The outer boundary polygon should closely follow the actual wall outline, including any indentations or extensions

Return ONLY valid JSON with this exact structure:
{
  "outerBoundary": [{"x": 0.0, "y": 0.0}, ...],
  "walls": [{"x1": 0.1, "y1": 0.2, "x2": 0.5, "y2": 0.2}, ...],
  "obstacles": [{"x": 0.1, "y": 0.2, "width": 0.05, "height": 0.1, "label": "desk"}, ...]
}

Do NOT include any explanation, markdown, or text outside the JSON.`;

  if (pass > 1 && previousResult) {
    return base + `\n\nPREVIOUS EXTRACTION (review and correct any errors — check that obstacle positions, sizes, and wall positions match what you see in the image):
${JSON.stringify(previousResult, null, 2)}

Fix any inaccuracies. Pay special attention to:
- Obstacles that are missing or whose positions/sizes don't match the image
- Wall segments that don't align with visible walls
- The outer boundary accuracy
- Make sure obstacle sizes are proportional to what's shown in the image`;
  }

  return base;
}

/**
 * Validate and clean extracted data
 */
function validateOutline(data: unknown): FloorPlanOutline | null {
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;

  // Validate outerBoundary
  const outerBoundary: { x: number; y: number }[] = [];
  if (Array.isArray(d.outerBoundary)) {
    for (const pt of d.outerBoundary) {
      if (pt && typeof pt === 'object' && 'x' in pt && 'y' in pt) {
        const x = clamp(Number(pt.x), 0, 1);
        const y = clamp(Number(pt.y), 0, 1);
        if (!isNaN(x) && !isNaN(y)) {
          outerBoundary.push({ x, y });
        }
      }
    }
  }

  // Validate walls
  const walls: WallSegment[] = [];
  if (Array.isArray(d.walls)) {
    for (const w of d.walls) {
      if (w && typeof w === 'object' && 'x1' in w && 'y1' in w && 'x2' in w && 'y2' in w) {
        const seg: WallSegment = {
          x1: clamp(Number(w.x1), 0, 1),
          y1: clamp(Number(w.y1), 0, 1),
          x2: clamp(Number(w.x2), 0, 1),
          y2: clamp(Number(w.y2), 0, 1),
          thickness: 3,
        };
        if (!isNaN(seg.x1) && !isNaN(seg.y1) && !isNaN(seg.x2) && !isNaN(seg.y2)) {
          // Skip degenerate segments
          const len = Math.sqrt((seg.x2 - seg.x1) ** 2 + (seg.y2 - seg.y1) ** 2);
          if (len > 0.005) {
            walls.push(seg);
          }
        }
      }
    }
  }

  // Validate obstacles
  const obstacles: ObstacleBlock[] = [];
  if (Array.isArray(d.obstacles)) {
    for (const o of d.obstacles) {
      if (o && typeof o === 'object' && 'x' in o && 'y' in o && 'width' in o && 'height' in o) {
        const ob: ObstacleBlock = {
          x: clamp(Number(o.x), 0, 1),
          y: clamp(Number(o.y), 0, 1),
          width: clamp(Number(o.width), 0.005, 1),
          height: clamp(Number(o.height), 0.005, 1),
          rotation: typeof (o as Record<string, unknown>).rotation === 'number' ? Number((o as Record<string, unknown>).rotation) : 0,
          label: typeof (o as Record<string, unknown>).label === 'string' ? String((o as Record<string, unknown>).label) : undefined,
        };
        if (!isNaN(ob.x) && !isNaN(ob.y) && !isNaN(ob.width) && !isNaN(ob.height)) {
          obstacles.push(ob);
        }
      }
    }
  }

  if (outerBoundary.length < 3 && walls.length === 0 && obstacles.length === 0) {
    return null;
  }

  return {
    outerBoundary,
    walls,
    obstacles,
    width: 900,
    height: 750,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Call OpenAI vision API with the floor plan image
 */
async function callVisionAPI(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  apiKey: string,
  model: string
): Promise<Record<string, unknown> | null> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    max_tokens: 16000,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: 'high',
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return null;

  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find JSON object boundaries
  const startIdx = jsonStr.indexOf('{');
  const endIdx = jsonStr.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    jsonStr = jsonStr.substring(startIdx, endIdx + 1);
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error('Failed to parse JSON from OpenAI response:', jsonStr.substring(0, 200));
    return null;
  }
}

/**
 * Main extraction function.
 * Takes a floor plan image and returns structured outline data.
 */
export async function extractFloorPlanOutline(
  imageBuffer: Buffer,
  mimeType: string,
  options: ExtractorOptions
): Promise<FloorPlanOutline> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const imageBase64 = imageBuffer.toString('base64');
  const passes = Math.min(3, Math.max(1, opts.passes ?? 2));

  let bestResult: FloorPlanOutline | null = null;

  for (let pass = 1; pass <= passes; pass++) {
    console.log(`[FloorPlan Extractor] Pass ${pass}/${passes}...`);
    
    const prompt = buildExtractionPrompt(pass, bestResult ?? undefined);
    const rawResult = await callVisionAPI(
      imageBase64,
      mimeType,
      prompt,
      opts.apiKey,
      opts.model ?? 'gpt-4o'
    );

    if (!rawResult) {
      console.warn(`[FloorPlan Extractor] Pass ${pass} returned no data`);
      continue;
    }

    const validated = validateOutline(rawResult);
    if (validated) {
      validated.width = opts.outputWidth ?? 900;
      validated.height = opts.outputHeight ?? 750;
      
      // Update wall thickness
      for (const w of validated.walls) {
        w.thickness = opts.wallThickness ?? 3;
      }
      
      bestResult = validated;
      console.log(`[FloorPlan Extractor] Pass ${pass}: ${validated.walls.length} walls, ${validated.obstacles.length} obstacles, ${validated.outerBoundary.length} boundary points`);
    }
  }

  if (!bestResult) {
    throw new Error('Failed to extract floor plan outline after all passes');
  }

  return bestResult;
}

/**
 * Render a FloorPlanOutline to an SVG string.
 * Produces a clean black-on-white drawing with only wall lines and obstacle blocks.
 */
export function renderOutlineToSVG(outline: FloorPlanOutline): string {
  const { width, height, outerBoundary, walls, obstacles } = outline;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background: white;">`;

  // Draw outer boundary as a closed polygon
  if (outerBoundary.length >= 3) {
    const points = outerBoundary
      .map((p) => `${(p.x * width).toFixed(1)},${(p.y * height).toFixed(1)}`)
      .join(' ');
    svg += `\n  <polygon points="${points}" fill="none" stroke="black" stroke-width="3" stroke-linejoin="miter"/>`;
  }

  // Draw interior walls as lines
  for (const wall of walls) {
    svg += `\n  <line x1="${(wall.x1 * width).toFixed(1)}" y1="${(wall.y1 * height).toFixed(1)}" x2="${(wall.x2 * width).toFixed(1)}" y2="${(wall.y2 * height).toFixed(1)}" stroke="black" stroke-width="${wall.thickness}" stroke-linecap="square"/>`;
  }

  // Draw obstacles as filled black rectangles
  for (const obs of obstacles) {
    const rx = obs.x * width;
    const ry = obs.y * height;
    const rw = obs.width * width;
    const rh = obs.height * height;

    if (obs.rotation && obs.rotation !== 0) {
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;
      svg += `\n  <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="black" transform="rotate(${obs.rotation} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
    } else {
      svg += `\n  <rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="black"/>`;
    }
  }

  svg += '\n</svg>';
  return svg;
}

/**
 * Render to an HTML Canvas-compatible drawing instructions object.
 * Useful for client-side rendering.
 */
export function renderOutlineToCanvasOps(outline: FloorPlanOutline): CanvasDrawOp[] {
  const { width, height, outerBoundary, walls, obstacles } = outline;
  const ops: CanvasDrawOp[] = [];

  // Background
  ops.push({ type: 'fillRect', x: 0, y: 0, w: width, h: height, color: 'white' });

  // Outer boundary
  if (outerBoundary.length >= 3) {
    ops.push({
      type: 'polygon',
      points: outerBoundary.map((p) => ({ x: p.x * width, y: p.y * height })),
      stroke: 'black',
      lineWidth: 3,
    });
  }

  // Walls
  for (const wall of walls) {
    ops.push({
      type: 'line',
      x1: wall.x1 * width,
      y1: wall.y1 * height,
      x2: wall.x2 * width,
      y2: wall.y2 * height,
      stroke: 'black',
      lineWidth: wall.thickness,
    });
  }

  // Obstacles
  for (const obs of obstacles) {
    ops.push({
      type: 'fillRect',
      x: obs.x * width,
      y: obs.y * height,
      w: obs.width * width,
      h: obs.height * height,
      color: 'black',
      rotation: obs.rotation,
    });
  }

  return ops;
}

export type CanvasDrawOp =
  | { type: 'fillRect'; x: number; y: number; w: number; h: number; color: string; rotation?: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; lineWidth: number }
  | { type: 'polygon'; points: { x: number; y: number }[]; stroke: string; lineWidth: number };
