import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { FloorPlan, Transition, MarkerPoint, TransitionPath, WizardStep } from '@/lib/types';

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
  setFloorPlanDimensions: (id: string, width: number, height: number) => void;

  // Transition actions
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

function rebuildTransitions(floorPlans: FloorPlan[], existingTransitions: Transition[]): Transition[] {
  const sorted = [...floorPlans].sort((a, b) => a.order - b.order);
  const newTransitions: Transition[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const fromId = sorted[i].id;
    const toId = sorted[i + 1].id;
    
    // Reuse existing transition if it exists for this pair
    const existing = existingTransitions.find(
      (t) => t.fromRoomId === fromId && t.toRoomId === toId
    );

    if (existing) {
      newTransitions.push(existing);
    } else {
      newTransitions.push({
        id: uuidv4(),
        fromRoomId: fromId,
        toRoomId: toId,
        csvFiles: {},
        path: null,
        processed: false,
      });
    }
  }

  return newTransitions;
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

    const newPlans = [...state.floorPlans, newPlan];
    set({
      floorPlans: newPlans,
      transitions: rebuildTransitions(newPlans, state.transitions),
    });
  },

  removeFloorPlan: (id) => {
    const state = get();
    const plan = state.floorPlans.find((p) => p.id === id);
    if (plan?.imageUrl) URL.revokeObjectURL(plan.imageUrl);

    const remaining = state.floorPlans
      .filter((p) => p.id !== id)
      .map((p, idx) => ({ ...p, order: idx }));

    set({
      floorPlans: remaining,
      transitions: rebuildTransitions(remaining, state.transitions),
      selectedFloorPlanId: state.selectedFloorPlanId === id ? null : state.selectedFloorPlanId,
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
    set({
      floorPlans: updated,
      transitions: rebuildTransitions(updated, state.transitions),
    });
  },

  reorderFloorPlans: (orderedIds) => {
    const state = get();
    const updated = orderedIds.map((id, idx) => {
      const plan = state.floorPlans.find((p) => p.id === id)!;
      return { ...plan, order: idx };
    });
    set({
      floorPlans: updated,
      transitions: rebuildTransitions(updated, state.transitions),
    });
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

  setFloorPlanDimensions: (id, width, height) => {
    set((state) => ({
      floorPlans: state.floorPlans.map((p) =>
        p.id === id ? { ...p, width, height } : p
      ),
    }));
  },

  updateTransitionCSV: (transitionId, fileType, file) => {
    set((state) => ({
      transitions: state.transitions.map((t) =>
        t.id === transitionId
          ? { ...t, csvFiles: { ...t.csvFiles, [fileType]: file }, processed: false }
          : t
      ),
    }));
  },

  setTransitionPath: (transitionId, path) => {
    set((state) => ({
      transitions: state.transitions.map((t) =>
        t.id === transitionId ? { ...t, path, processed: true } : t
      ),
    }));
  },

  setTransitionProcessed: (transitionId, processed) => {
    set((state) => ({
      transitions: state.transitions.map((t) =>
        t.id === transitionId ? { ...t, processed } : t
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
