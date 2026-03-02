/**
 * Client-side Floor Plan Image Processor
 *
 * Generates a walkability grid directly from floor plan image pixels
 * using brightness thresholding and morphological dilation.
 *
 * No API calls needed — runs entirely in the browser, < 100ms.
 */

import type { WalkabilityGrid } from './walkabilityGrid';

export interface RoomLabel {
  id: string;
  label: string;
  /** Normalized 0-1 position on the image */
  x: number;
  y: number;
}

/**
 * Process a floor plan image into a walkability grid using pixel thresholding.
 *
 * @param image - The loaded HTMLImageElement
 * @param threshold - Brightness threshold 0-255. Pixels brighter than this = walkable. (default: 200)
 * @param resolution - Grid cells along the longest axis (default: 150)
 * @param wallDilation - How many cells to expand walls by for collision margin (default: 2)
 */
export function processFloorPlanImage(
  image: HTMLImageElement,
  threshold: number = 200,
  resolution: number = 150,
  wallDilation: number = 2
): WalkabilityGrid {
  const imgW = image.naturalWidth;
  const imgH = image.naturalHeight;

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

  // Draw image onto offscreen canvas at grid resolution
  const canvas = new OffscreenCanvas(cols, rows);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, cols, rows);

  // Read pixel data
  const imageData = ctx.getImageData(0, 0, cols, rows);
  const pixels = imageData.data;

  // Pass 1: Threshold — convert to walkable/blocked
  const raw: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 4;
      const red = pixels[idx];
      const green = pixels[idx + 1];
      const blue = pixels[idx + 2];
      // Grayscale brightness
      const brightness = (red + green + blue) / 3;
      // Bright pixels = walkable, dark pixels = wall
      row.push(brightness >= threshold);
    }
    raw.push(row);
  }

  // Pass 2: Dilate walls (expand blocked areas) for collision margin
  let grid = raw;
  if (wallDilation > 0) {
    grid = dilateWalls(raw, rows, cols, wallDilation);
  }

  const cellWidth = 900 / cols; // Use standard output dimensions
  const cellHeight = 750 / rows;

  return {
    grid,
    rows,
    cols,
    cellWidth,
    cellHeight,
    imageWidth: 900,
    imageHeight: 750,
  };
}

/**
 * Expand blocked (wall) cells by `radius` in all directions.
 * This prevents the player from walking right along thin wall edges.
 */
function dilateWalls(
  grid: boolean[][],
  rows: number,
  cols: number,
  radius: number
): boolean[][] {
  // Create a distance map: for each cell, distance to nearest wall
  const result: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) {
        // Already a wall
        row.push(false);
        continue;
      }
      // Check if any wall is within `radius` cells
      let nearWall = false;
      for (let dr = -radius; dr <= radius && !nearWall; dr++) {
        for (let dc = -radius; dc <= radius && !nearWall; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
            // Out of bounds = treat as wall
            nearWall = true;
          } else if (!grid[nr][nc]) {
            // This neighbor is a wall — check Manhattan or Euclidean distance
            if (Math.sqrt(dr * dr + dc * dc) <= radius) {
              nearWall = true;
            }
          }
        }
      }
      row.push(!nearWall);
    }
    result.push(row);
  }
  return result;
}

/**
 * Generate a preview overlay image showing walkable/blocked areas.
 * Returns a Blob URL.
 */
export async function generateOverlayPreview(
  grid: WalkabilityGrid,
  width: number,
  height: number
): Promise<string> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  const scaleX = width / grid.cols;
  const scaleY = height / grid.rows;

  ctx.clearRect(0, 0, width, height);

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      ctx.fillStyle = grid.grid[r][c]
        ? 'rgba(34, 197, 94, 0.15)' // green = walkable
        : 'rgba(239, 68, 68, 0.30)'; // red  = blocked
      ctx.fillRect(c * scaleX, r * scaleY, scaleX + 0.5, scaleY + 0.5);
    }
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return URL.createObjectURL(blob);
}

/**
 * Count walkable vs blocked cells for stats display.
 */
export function getGridStats(grid: WalkabilityGrid): { walkable: number; blocked: number; percent: number } {
  let walkable = 0;
  let blocked = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.grid[r][c]) walkable++;
      else blocked++;
    }
  }
  return {
    walkable,
    blocked,
    percent: Math.round((walkable / (walkable + blocked)) * 100),
  };
}
