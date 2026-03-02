import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  FloorPlan,
  Transition,
  MarkerPoint,
  TransitionPath,
  WizardStep,
  TransitionDataset,
  TransitionCsvFiles,
} from '@/lib/types';
import type { FloorPlanOutline } from '@/lib/floorplanExtractor';

interface MapStore {
  // State
  floorPlans: FloorPlan[];
  transitions: Transition[];
  currentStep: WizardStep;
  selectedFloorPlanId: string | null;
  selectedTransitionId: string | null;
  mapScale: number;
  mapOffset: { x: number; y: number };
  isProcessing: boolean;

  // Floor plan actions
  addFloorPlan: (file: File, name: string) => void;
  removeFloorPlan: (id: string) => void;
  updateFloorPlanName: (id: string, name: string) => void;
  updateFloorPlanOrder: (id: string, order: number) => void;
  reorderFloorPlans: (orderedIds: string[]) => void;
  setExitPoint: (id: string, point: MarkerPoint | null) => void;
  setEntryPoint: (id: string, point: MarkerPoint | null) => void;
  setEps32Point: (id: string, point: MarkerPoint | null) => void;
  setFloorPlanDimensions: (id: string, width: number, height: number) => void;
  setFloorPlanPosition: (id: string, x: number, y: number) => void;
  setFloorPlanOutline: (id: string, outline: FloorPlanOutline | null) => void;

  // Transition actions
  addTransition: (fromRoomId: string, toRoomId: string) => string | null;
  removeTransition: (transitionId: string) => void;
  addTransitionDataset: (transitionId: string, name?: string) => string | null;
  removeTransitionDataset: (transitionId: string, datasetId: string) => void;
  selectTransitionDataset: (transitionId: string, datasetId: string) => void;
  updateTransitionCSV: (transitionId: string, fileType: string, file: File) => void;
  setTransitionPath: (transitionId: string, path: TransitionPath) => void;
  setTransitionProcessed: (transitionId: string, processed: boolean) => void;

  // Navigation
  setCurrentStep: (step: WizardStep) => void;
  selectFloorPlan: (id: string | null) => void;
  selectTransition: (id: string | null) => void;

  // Map controls
  setMapScale: (scale: number) => void;
  setMapOffset: (offset: { x: number; y: number }) => void;
  setIsProcessing: (processing: boolean) => void;

  // Computed
  getOrderedFloorPlans: () => FloorPlan[];
  getTransitionForPair: (fromId: string, toId: string) => Transition | undefined;
}

function createEmptyDataset(index = 1, name?: string): TransitionDataset {
  return {
    id: uuidv4(),
    name: name ?? `Pathway ${index}`,
    csvFiles: {},
    path: null,
    processed: false,
  };
}

function syncTransitionSummary(transition: Transition): Transition {
  const selectedDataset = transition.datasets.find((d) => d.id === transition.selectedDatasetId)
    ?? transition.datasets[0]
    ?? null;

  if (!selectedDataset) {
    return {
      ...transition,
      selectedDatasetId: null,
      csvFiles: {},
      path: null,
      processed: false,
    };
  }

  return {
    ...transition,
    selectedDatasetId: selectedDataset.id,
    csvFiles: selectedDataset.csvFiles,
    path: selectedDataset.path,
    processed: selectedDataset.processed,
  };
}

function removeTransitionsForMissingRooms(floorPlans: FloorPlan[], transitions: Transition[]): Transition[] {
  const validIds = new Set(floorPlans.map((p) => p.id));
  return transitions.filter((t) => validIds.has(t.fromRoomId) && validIds.has(t.toRoomId));
}

export const useMapStore = create<MapStore>((set, get) => ({
  floorPlans: [],
  transitions: [],
  currentStep: 'upload',
  selectedFloorPlanId: null,
  selectedTransitionId: null,
  mapScale: 1,
  mapOffset: { x: 0, y: 0 },
  isProcessing: false,

  addFloorPlan: (file, name) => {
    const state = get();
    if (state.floorPlans.length >= 5) return;

    const imageUrl = URL.createObjectURL(file);
    const newPlan: FloorPlan = {
      id: uuidv4(),
      name,
      imageUrl,
      file,
      order: state.floorPlans.length,
      exitPoint: null,
      entryPoint: null,
      width: 0,
      height: 0,
    };

    set({
      floorPlans: [...state.floorPlans, newPlan],
    });
  },

  removeFloorPlan: (id) => {
    const state = get();
    const plan = state.floorPlans.find((p) => p.id === id);
    if (plan?.imageUrl) URL.revokeObjectURL(plan.imageUrl);

    const remaining = state.floorPlans
      .filter((p) => p.id !== id)
      .map((p, idx) => ({ ...p, order: idx }));

    const filteredTransitions = removeTransitionsForMissingRooms(remaining, state.transitions);
    const selectedStillExists = filteredTransitions.some((t) => t.id === state.selectedTransitionId);

    set({
      floorPlans: remaining,
      transitions: filteredTransitions,
      selectedFloorPlanId: state.selectedFloorPlanId === id ? null : state.selectedFloorPlanId,
      selectedTransitionId: selectedStillExists ? state.selectedTransitionId : null,
    });
  },

  updateFloorPlanName: (id, name) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, name } : p
      ),
    }));
  },

  updateFloorPlanOrder: (id, order) => {
    const state = get();
    const updated = state.floorPlans.map((p) =>
      p.id === id ? { ...p, order } : p
    );
    set({ floorPlans: updated });
  },

  reorderFloorPlans: (orderedIds) => {
    const state = get();
    const updated = orderedIds.map((id, idx) => {
      const plan = state.floorPlans.find((p) => p.id === id)!;
      return { ...plan, order: idx };
    });
    set({ floorPlans: updated });
  },

  setExitPoint: (id, point) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, exitPoint: point } : p
      ),
    }));
  },

  setEntryPoint: (id, point) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, entryPoint: point } : p
      ),
    }));
  },

  setEps32Point: (id, point) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, eps32Point: point } : p
      ),
    }));
  },

  setFloorPlanDimensions: (id, width, height) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, width, height } : p
      ),
    }));
  },

  setFloorPlanPosition: (id, x, y) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, position: { x, y } } : p
      ),
    }));
  },

  setFloorPlanOutline: (id, outline) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, outline } : p
      ),
    }));
  },

  addTransition: (fromRoomId, toRoomId) => {
    const state = get();
    if (fromRoomId === toRoomId) return null;

    const hasFrom = state.floorPlans.some((p) => p.id === fromRoomId);
    const hasTo = state.floorPlans.some((p) => p.id === toRoomId);
    if (!hasFrom || !hasTo) return null;

    const initialDataset = createEmptyDataset(1);
    const newTransition: Transition = {
      id: uuidv4(),
      fromRoomId,
      toRoomId,
      datasets: [initialDataset],
      selectedDatasetId: initialDataset.id,
      csvFiles: initialDataset.csvFiles,
      path: initialDataset.path,
      processed: initialDataset.processed,
    };

    set({
      transitions: [...state.transitions, newTransition],
      selectedTransitionId: newTransition.id,
    });

    return newTransition.id;
  },

  removeTransition: (transitionId) => {
    set((state) => ({
      transitions: state.transitions.filter((t) => t.id !== transitionId),
      selectedTransitionId: state.selectedTransitionId === transitionId ? null : state.selectedTransitionId,
    }));
  },

  addTransitionDataset: (transitionId, name) => {
    const state = get();
    const transition = state.transitions.find((t) => t.id === transitionId);
    if (!transition) return null;

    const dataset = createEmptyDataset(transition.datasets.length + 1, name);

    set({
      transitions: state.transitions.map((t) => {
        if (t.id !== transitionId) return t;
        const updated = {
          ...t,
          datasets: [...t.datasets, dataset],
          selectedDatasetId: dataset.id,
        };
        return syncTransitionSummary(updated);
      }),
    });

    return dataset.id;
  },

  removeTransitionDataset: (transitionId, datasetId) => {
    set((state) => ({
      transitions: state.transitions.map((t) => {
        if (t.id !== transitionId) return t;
        if (t.datasets.length <= 1) return t;
        const remaining = t.datasets.filter((d) => d.id !== datasetId);
        const selectedDatasetId =
          t.selectedDatasetId === datasetId
            ? remaining[0]?.id ?? null
            : t.selectedDatasetId;
        return syncTransitionSummary({ ...t, datasets: remaining, selectedDatasetId });
      }),
    }));
  },

  selectTransitionDataset: (transitionId, datasetId) => {
    set((state) => ({
      transitions: state.transitions.map((t) => {
        if (t.id !== transitionId) return t;
        if (!t.datasets.some((d) => d.id === datasetId)) return t;
        return syncTransitionSummary({ ...t, selectedDatasetId: datasetId });
      }),
    }));
  },

  updateTransitionCSV: (transitionId, fileType, file) => {
    set((state) => ({
      transitions: state.transitions.map((t) =>
        t.id === transitionId
          ? syncTransitionSummary({
              ...t,
              datasets: t.datasets.map((dataset) =>
                dataset.id === t.selectedDatasetId
                  ? {
                      ...dataset,
                      csvFiles: { ...dataset.csvFiles, [fileType]: file } as TransitionCsvFiles,
                      processed: false,
                    }
                  : dataset
              ),
            })
          : t
      ),
    }));
  },

  setTransitionPath: (transitionId, path) => {
    set((state) => ({
      transitions: state.transitions.map((t) =>
        t.id === transitionId
          ? syncTransitionSummary({
              ...t,
              datasets: t.datasets.map((dataset) =>
                dataset.id === t.selectedDatasetId
                  ? { ...dataset, path, processed: true }
                  : dataset
              ),
            })
          : t
      ),
    }));
  },

  setTransitionProcessed: (transitionId, processed) => {
    set((state) => ({
      transitions: state.transitions.map((t) =>
        t.id === transitionId
          ? syncTransitionSummary({
              ...t,
              datasets: t.datasets.map((dataset) =>
                dataset.id === t.selectedDatasetId
                  ? { ...dataset, processed }
                  : dataset
              ),
            })
          : t
      ),
    }));
  },

  setCurrentStep: (step) => set({ currentStep: step }),
  selectFloorPlan: (id) => set({ selectedFloorPlanId: id }),
  selectTransition: (id) => set({ selectedTransitionId: id }),
  setMapScale: (scale) => set({ mapScale: scale }),
  setMapOffset: (offset) => set({ mapOffset: offset }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),

  getOrderedFloorPlans: () => {
    return [...get().floorPlans].sort((a, b) => a.order - b.order);
  },

  getTransitionForPair: (fromId, toId) => {
    return get().transitions.find(
      (t) => t.fromRoomId === fromId && t.toRoomId === toId
    );
  },
}));
