import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { listMapProjectSummaries, saveMapProject } from '@/lib/mapStorage';
import type { MapProject } from '@/lib/types';

export async function GET() {
  const projects = await listMapProjectSummaries();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const body = await req.json() as { name: string; description?: string };

  const now = new Date().toISOString();
  const projectId = uuidv4();

  const project: MapProject = {
    id: projectId,
    name: body.name || 'Untitled Map',
    description: body.description,
    createdAt: now,
    updatedAt: now,
    masterMap: {
      id: uuidv4(),
      imageUrl: '',
      width: 0,
      height: 0,
      pins: [],
    },
    subMaps: [],
  };

  await saveMapProject(project);
  return NextResponse.json(project, { status: 201 });
}
