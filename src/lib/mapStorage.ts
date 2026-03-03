/**
 * Map Project Storage
 *
 * Reads and writes MapProject configs as JSON files on the server.
 * Stored at: public/maps/[projectId]/config.json
 */

import type { MapProject } from './types';

// This module is server-only (uses Node fs)
// It should only be imported from API routes or server components

export function getMapsDir(): string {
  const path = require('path') as typeof import('path');
  return path.join(process.cwd(), 'public', 'maps');
}

export async function ensureMapsDir(): Promise<void> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const dir = getMapsDir();
  await fs.mkdir(dir, { recursive: true });
}

export async function listMapProjects(): Promise<MapProject[]> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');
  const dir = getMapsDir();

  try {
    await ensureMapsDir();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const projects: MapProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const configPath = path.join(dir, entry.name, 'config.json');
      try {
        const raw = await fs.readFile(configPath, 'utf-8');
        const project = JSON.parse(raw) as MapProject;
        projects.push(project);
      } catch {
        // Skip malformed entries
      }
    }

    return projects.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function loadMapProject(id: string): Promise<MapProject | null> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');
  const configPath = path.join(getMapsDir(), id, 'config.json');

  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw) as MapProject;
  } catch {
    return null;
  }
}

export async function saveMapProject(project: MapProject): Promise<void> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');

  const dir = path.join(getMapsDir(), project.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'config.json'),
    JSON.stringify(project, null, 2),
    'utf-8'
  );
}

export async function deleteMapProject(id: string): Promise<void> {
  const fs = require('fs/promises') as typeof import('fs/promises');
  const path = require('path') as typeof import('path');

  const dir = path.join(getMapsDir(), id);
  await fs.rm(dir, { recursive: true, force: true });
}
