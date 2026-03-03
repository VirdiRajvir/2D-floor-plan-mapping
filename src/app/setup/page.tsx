'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { getOpenAIKey } from '@/components/ApiKeySettings';
import type { MapProject, SubMap, FloorLevel, WalkabilityConfig, SerializedWalkabilityGrid, DoorMarker, MarkerPoint, Model3DAsset } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';
import { Step1Upload } from '@/components/setup/Step1Upload';
import { Step2MasterPin } from '@/components/setup/Step2MasterPin';
import { Step3Configure } from '@/components/setup/Step3Configure';
import { SETUP_STEPS } from '@/lib/types';
import { SetupAgent } from '@/components/chat/SetupAgent';

interface UploadedImage {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  file: File;
}

export default function SetupPage() {
  const router = useRouter();
  const { setProject } = useMapProjectStore();

  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);
  const [projectName, setProjectName] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [masterImageId, setMasterImageId] = useState<string | null>(null);
  const [pinnedImages, setPinnedImages] = useState<{
    imageId: string;
    x: number;
    y: number;
    label: string;
    footprint?: { x: number; y: number; width: number; height: number };
    model3D?: Model3DAsset;
  }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 0 → 1: upload complete
  const handleUploadComplete = (imgs: UploadedImage[]) => {
    setImages(imgs);
    setCurrentStep(1);
  };

  // Step 1 → 2: master + pins defined
  const handleMasterPinComplete = (
    masterId: string,
    pins: typeof pinnedImages
  ) => {
    setMasterImageId(masterId);
    setPinnedImages(pins);
    setCurrentStep(2);
  };

  // Step 2 → done: save project
  const handleConfigureComplete = async (
    configs: {
      imageId: string;
      walkabilityConfig: WalkabilityConfig;
      walkabilityReady?: boolean;
      walkabilityGrid?: SerializedWalkabilityGrid;
      pendingAIDetection?: boolean;
      doorMarkers?: { id: string; x: number; y: number }[];
      entryPoints?: { x: number; y: number }[];
      exitPoints?: { x: number; y: number }[];
    }[]
  ) => {
    if (!masterImageId) return;
    setSaving(true);
    setError('');

    try {
      // Build the MapProject
      const master = images.find(i => i.id === masterImageId)!;
      const now = new Date().toISOString();
      const pid = uuidv4();

      // Separate building pins from 3D-only pins
      const buildingPins = pinnedImages.filter(p => !p.model3D);
      const threeDOnlyPins = pinnedImages.filter(p => !!p.model3D);

      // Build subMaps from pinned images (building pins only)
      const subMaps: SubMap[] = buildingPins.map(pin => {
        const img = images.find(i => i.id === pin.imageId)!;
        const config = configs.find(c => c.imageId === pin.imageId);
        const floorId = uuidv4();
        const floor: FloorLevel = {
          id: floorId,
          floorNumber: 1,
          label: 'Ground Floor',
          imageUrl: img.url,
          width: img.width,
          height: img.height,
          walkabilityConfig: config?.walkabilityConfig ?? {
            threshold: 128,
            dilation: 2,
            resolution: 150,
          },
          walkabilityGrid: config?.walkabilityGrid,
          rooms: [],
          doors: (config?.doorMarkers ?? []).map((m): DoorMarker => ({ id: m.id, x: m.x, y: m.y })),
          stairConnections: [],
          entryPoints: (config?.entryPoints ?? []).map((p): MarkerPoint => ({ x: p.x * 100, y: p.y * 100 })),
          exitPoints: (config?.exitPoints ?? []).map((p): MarkerPoint => ({ x: p.x * 100, y: p.y * 100 })),
        };
        const subMapId = uuidv4();
        return {
          id: subMapId,
          name: pin.label || img.name.replace(/\.[^.]+$/, ''),
          floors: [floor],
          activeFloorId: floorId,
        };
      });

      // Build pins linking to subMaps (building pins)
      const mapPins = buildingPins.map((pin, idx) => ({
        id: uuidv4(),
        label: pin.label || subMaps[idx].name,
        x: pin.x,
        y: pin.y,
        subMapId: subMaps[idx].id,
        footprint: pin.footprint,
        icon: 'default' as const,
      }));

      // Add 3D-only pins (not linked to any sub-map)
      const threeDMapPins = threeDOnlyPins.map(pin => ({
        id: uuidv4(),
        label: pin.label || '3D Model',
        x: pin.x,
        y: pin.y,
        subMapId: '',
        footprint: pin.footprint,
        icon: '3d' as const,
        model3D: pin.model3D,
      }));

      const allPins = [...mapPins, ...threeDMapPins];

      const project: MapProject = {
        id: pid,
        name: projectName || 'My Map Project',
        createdAt: now,
        updatedAt: now,
        masterMap: {
          id: uuidv4(),
          imageUrl: master.url,
          width: master.width,
          height: master.height,
          pins: allPins,
        },
        subMaps,
      };

      // Save via API
      const res = await fetch(`/api/maps/${pid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });

      // Helper: run AI detection for each subMap that opted in
      const runAIDetection = async (finalProject: MapProject) => {
        const aiKey = getOpenAIKey();
        if (!aiKey || !configs.some(c => c.pendingAIDetection)) return;
        for (const subMap of finalProject.subMaps) {
          for (const floor of subMap.floors) {
            await fetch(`/api/maps/${finalProject.id}/detect-elements`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ subMapId: subMap.id, floorId: floor.id, apiKey: aiKey }),
            }).catch(() => {/* non-fatal — AI detection is best-effort */});
          }
        }
      };

      if (!res.ok) {
        // Try POST first
        const createRes = await fetch('/api/maps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: project.name }),
        });
        if (!createRes.ok) throw new Error('Failed to create project');
        const created = await createRes.json() as MapProject;

        await fetch(`/api/maps/${created.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...project, id: created.id }),
        });
        const finalProject = { ...project, id: created.id };
        setProject(finalProject);
        await runAIDetection(finalProject);
        router.push(`/map/${created.id}`);
        return;
      }

      setProject(project);
      await runAIDetection(project);
      router.push(`/map/${pid}`);
    } catch (err) {
      setError(`Failed to save project: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-slate-400 hover:text-slate-200 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </a>
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Create New Map</h1>
              {projectName && <p className="text-sm text-slate-400">{projectName}</p>}
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {SETUP_STEPS.map((step, idx) => (
              <div key={step.key} className="flex items-center">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
                    idx === currentStep
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : idx < currentStep
                      ? 'bg-green-500/20 text-green-400'
                      : 'text-slate-500'
                  }`}
                >
                  {idx < currentStep ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                  )}
                  <span className="hidden sm:block">{step.label}</span>
                </div>
                {idx < SETUP_STEPS.length - 1 && (
                  <div className={`w-6 h-px mx-1 ${idx < currentStep ? 'bg-green-500/50' : 'bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step description */}
      <div className="max-w-5xl mx-auto px-6 py-4">
        <p className="text-sm text-slate-400">{SETUP_STEPS[currentStep].description}</p>
      </div>

      {error && (
        <div className="max-w-5xl mx-auto px-6 mb-4">
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 text-sm">
            {error}
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="max-w-5xl mx-auto px-6 pb-12">
        {currentStep === 0 && (
          <Step1Upload
            projectName={projectName}
            onProjectNameChange={setProjectName}
            onComplete={handleUploadComplete}
          />
        )}
        {currentStep === 1 && (
          <Step2MasterPin
            images={images}
            onComplete={handleMasterPinComplete}
            onBack={() => setCurrentStep(0)}
          />
        )}
        {currentStep === 2 && (
          <Step3Configure
            images={images}
            pinnedImages={pinnedImages}
            masterImageId={masterImageId!}
            saving={saving}
            onComplete={handleConfigureComplete}
            onBack={() => setCurrentStep(1)}
          />
        )}
      </div>

      {/* Setup AI Assistant */}
      <SetupAgent
        currentStep={currentStep}
        imageCount={images.length}
        projectName={projectName}
        pinCount={pinnedImages.length}
        hasMaster={!!masterImageId}
      />
    </div>
  );
}
