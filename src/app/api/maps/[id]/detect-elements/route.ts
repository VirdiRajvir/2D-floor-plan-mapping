import { NextResponse } from 'next/server';
import { loadMapProject, saveMapProject } from '@/lib/mapStorage';
import { detectFloorPlanElements } from '@/lib/elementDetector';
import type { EnhancedFloorPlanOutline } from '@/lib/types';

interface Params { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;

  const project = await loadMapProject(id);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await req.json() as {
    subMapId: string;
    floorId: string;
    imageUrl: string;
    apiKey?: string;
  };

  const { subMapId, floorId, imageUrl, apiKey } = body;

  let imageBuffer: Buffer;
  let mimeType = 'image/jpeg';

  try {
    // Fetch the image from the public folder
    const path = require('path') as typeof import('path');
    const fs = require('fs/promises') as typeof import('fs/promises');

    const publicPath = path.join(process.cwd(), 'public', imageUrl.replace(/^\//, ''));
    imageBuffer = await fs.readFile(publicPath);

    if (imageUrl.endsWith('.png')) mimeType = 'image/png';
    else if (imageUrl.endsWith('.webp')) mimeType = 'image/webp';
    else if (imageUrl.endsWith('.gif')) mimeType = 'image/gif';
  } catch (err) {
    return NextResponse.json({ error: `Could not read image: ${err}` }, { status: 400 });
  }

  try {
    const outline = await detectFloorPlanElements(imageBuffer, mimeType, apiKey);

    // Update the project with the detected outline
    const subMap = project.subMaps.find(s => s.id === subMapId);
    if (subMap) {
      const floor = subMap.floors.find(f => f.id === floorId);
      if (floor) {
        floor.outline = outline;
        project.updatedAt = new Date().toISOString();
        await saveMapProject(project);
      }
    }

    return NextResponse.json({ outline });
  } catch (err) {
    return NextResponse.json({ error: `Detection failed: ${err}` }, { status: 500 });
  }
}
