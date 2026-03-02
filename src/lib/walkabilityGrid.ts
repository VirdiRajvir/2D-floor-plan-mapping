/**
 * Walkability Grid Generator
 *
 * Takes a FloorPlanOutline (from GPT-4o extraction) and produces a 2D boolean
 * grid where `true` = walkable and `false` = blocked (wall/obstacle).
 *
 * Uses an offscreen canvas to rasterize the geometry, then samples pixels.
 */

import type { FloorPlanOutline } from './floorplanExtractor';

export interface WalkabilityGrid {
  grid: boolean[][]; // grid[row][col], true = walkable
  rows: number;
  cols: number;
  /** How many image-pixels one grid cell represents */
  cellWidth: number;
  cellHeight: number;
  /** The outline dimensions this grid was generated from */
  imageWidth: number;
  imageHeight: number;
}

/**
 * Generate a walkability grid from a FloorPlanOutline.
 *
 * @param outline - The extracted floor plan outline data
 * @param resolution - Number of cells along the longest axis (higher = more precise, slower)
 * @param wallMargin - Extra thickness (in grid cells) added to walls for collision margin
 */
export function generateWalkabilityGrid(
  outline: FloorPlanOutline,
  resolution: number = 150,
  wallMargin: number = 1
): WalkabilityGrid {
  const { width: imgW, height: imgH, outerBoundary, walls, obstacles } = outline;

  // Determine grid dimensions proportional to image
  const aspect = imgW / imgH;
  let cols: number, rows: number;
  if (aspect >= 1) {
    cols = resolution;
    rows = Math.round(resolution / aspect);
  } else {
    rows = resolution;
    cols = Math.round(resolution * aspect);
  }

  const cellWidth = imgW / cols;
  const cellHeight = imgH / rows;

  // Create offscreen canvas at grid resolution
  const canvas = new OffscreenCanvas(cols, rows);
  const ctx = canvas.getContext('2d')!;

  // Start fully black (non-walkable)
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cols, rows);

  // Fill outer boundary polygon → walkable (white)
  if (outerBoundary.length >= 3) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(outerBoundary[0].x * cols, outerBoundary[0].y * rows);
    for (let i = 1; i < outerBoundary.length; i++) {
      ctx.lineTo(outerBoundary[i].x * cols, outerBoundary[i].y * rows);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Draw walls as thick black lines → non-walkable
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  const wallThicknessGrid = 2 + wallMargin * 2; // base thickness + margin
  for (const wall of walls) {
    ctx.lineWidth = wallThicknessGrid;
    ctx.beginPath();
    ctx.moveTo(wall.x1 * cols, wall.y1 * rows);
    ctx.lineTo(wall.x2 * cols, wall.y2 * rows);
    ctx.stroke();
  }

  // Draw obstacles as filled black rectangles → non-walkable
  ctx.fillStyle = '#000';
  for (const obs of obstacles) {
    const ox = obs.x * cols;
    const oy = obs.y * rows;
    const ow = Math.max(1, obs.width * cols);
    const oh = Math.max(1, obs.height * rows);

    if (obs.rotation && obs.rotation !== 0) {
      ctx.save();
      ctx.translate(ox + ow / 2, oy + oh / 2);
      ctx.rotate((obs.rotation * Math.PI) / 180);
      ctx.fillRect(-ow / 2 - wallMargin, -oh / 2 - wallMargin, ow + wallMargin * 2, oh + wallMargin * 2);
      ctx.restore();
    } else {
      ctx.fillRect(
        ox - wallMargin,
        oy - wallMargin,
        ow + wallMargin * 2,
        oh + wallMargin * 2
      );
    }
  }

  // Read pixel data and convert to boolean grid
  const imageData = ctx.getImageData(0, 0, cols, rows);
  const pixels = imageData.data;
  const grid: boolean[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4;
      // White (255) = walkable, Black (0) = blocked
      row.push(pixels[idx] > 128);
    }
    grid.push(row);
  }

  return {
    grid,
    rows,
    cols,
    cellWidth,
    cellHeight,
    imageWidth: imgW,
    imageHeight: imgH,
  };
}

/**
 * Check if a grid cell is walkable.
 */
export function isWalkable(wg: WalkabilityGrid, col: number, row: number): boolean {
  if (row < 0 || row >= wg.rows || col < 0 || col >= wg.cols) return false;
  return wg.grid[row][col];
}

/**
 * Convert image-space coordinates (pixels) to grid coordinates.
 */
export function imageToGrid(
  wg: WalkabilityGrid,
  imgX: number,
  imgY: number
): { col: number; row: number } {
  return {
    col: Math.floor(imgX / wg.cellWidth),
    row: Math.floor(imgY / wg.cellHeight),
  };
}

/**
 * Convert grid coordinates to image-space coordinates (center of cell).
 */
export function gridToImage(
  wg: WalkabilityGrid,
  col: number,
  row: number
): { x: number; y: number } {
  return {
    x: (col + 0.5) * wg.cellWidth,
    y: (row + 0.5) * wg.cellHeight,
  };
}

/**
 * Convert normalized (0-1) coordinates to grid coordinates.
 */
export function normalizedToGrid(
  wg: WalkabilityGrid,
  nx: number,
  ny: number
): { col: number; row: number } {
  return {
    col: Math.floor(nx * wg.cols),
    row: Math.floor(ny * wg.rows),
  };
}

/**
 * Convert grid coordinates to normalized (0-1) coordinates.
 */
export function gridToNormalized(
  wg: WalkabilityGrid,
  col: number,
  row: number
): { x: number; y: number } {
  return {
    x: (col + 0.5) / wg.cols,
    y: (row + 0.5) / wg.rows,
  };
}

/**
 * Render a walkability overlay image as a data URL.
 * Green tint = walkable, no color = non-walkable.
 */
export function renderWalkabilityOverlay(
  wg: WalkabilityGrid,
  renderWidth: number,
  renderHeight: number
): string {
  const canvas = new OffscreenCanvas(renderWidth, renderHeight);
  const ctx = canvas.getContext('2d')!;

  const scaleX = renderWidth / wg.cols;
  const scaleY = renderHeight / wg.rows;

  ctx.clearRect(0, 0, renderWidth, renderHeight);

  for (let r = 0; r < wg.rows; r++) {
    for (let c = 0; c < wg.cols; c++) {
      if (wg.grid[r][c]) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.15)'; // green tint for walkable
      } else {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'; // red tint for blocked
      }
      ctx.fillRect(c * scaleX, r * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  // Convert to blob URL synchronously via ImageData
  const imgData = ctx.getImageData(0, 0, renderWidth, renderHeight);
  const tempCanvas = new OffscreenCanvas(renderWidth, renderHeight);
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.putImageData(imgData, 0, 0);

  // Return as blob (caller must handle async)
  return ''; // We'll use the async version below
}

/**
 * Async version: render overlay and return a blob URL.
 */
export async function renderWalkabilityOverlayAsync(
  wg: WalkabilityGrid,
  renderWidth: number,
  renderHeight: number
): Promise<string> {
  const canvas = new OffscreenCanvas(renderWidth, renderHeight);
  const ctx = canvas.getContext('2d')!;

  const scaleX = renderWidth / wg.cols;
  const scaleY = renderHeight / wg.rows;

  ctx.clearRect(0, 0, renderWidth, renderHeight);

  for (let r = 0; r < wg.rows; r++) {
    for (let c = 0; c < wg.cols; c++) {
      if (wg.grid[r][c]) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.12)'; // walkable
      } else {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)'; // blocked
      }
      ctx.fillRect(c * scaleX, r * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return URL.createObjectURL(blob);
}
