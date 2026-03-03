import { NextResponse } from 'next/server';
import { loadMapProject, saveMapProject, deleteMapProject } from '@/lib/mapStorage';
import type { MapProject } from '@/lib/types';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const project = await loadMapProject(id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(project);
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const existing = await loadMapProject(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates = await req.json() as Partial<MapProject>;
  const updated: MapProject = {
    ...existing,
    ...updates,
    id,  // never overwrite id
    updatedAt: new Date().toISOString(),
  };

  await saveMapProject(updated);
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await deleteMapProject(id);
  return NextResponse.json({ success: true });
}
