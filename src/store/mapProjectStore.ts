/**
 * Map Project Store (Zustand)
 *
 * Manages the active map project, navigation state, and rescue operation.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { computeUniversalPath } from '@/lib/universalPathfinder';
import type {
  MapProject,
  SubMap,
  FloorLevel,
  MapPin,
  RoomAnnotation,
  DoorMarker,
  RescueOperation,
  WalkabilityConfig,
  EnhancedFloorPlanOutline,
  SerializedWalkabilityGrid,
  MasterMap,
} from '@/lib/types';

export type ViewLevel = 'master' | 'submap';

interface MapProjectState {
  // Current project
  project: MapProject | null;

  // Navigation state
  viewLevel: ViewLevel;
  activeSubMapId: string | null;
  activeFloorId: string | null;

  // Zoom / pan on master map
  masterZoom: number;
  masterOffset: { x: number; y: number };

  // Zoom / pan on sub-map
  subMapZoom: number;
  subMapOffset: { x: number; y: number };

  // Rescue operation (session only — not persisted)
  rescue: RescueOperation;

  // UI state
  showWalkabilityOverlay: boolean;
  showElementOverlay: boolean;
  isRescueMode: boolean;
  rescuePlacingFor: 'rescuer' | 'rescuee' | null;  // which position is being placed
  isZoomingIn: boolean;
  isZoomingOut: boolean;
  zoomTargetPin: MapPin | null;

  // Actions — project CRUD
  setProject: (project: MapProject | null) => void;
  updateProject: (updates: Partial<MapProject>) => void;

  // Actions — master map
  updateMasterMap: (updates: Partial<MasterMap>) => void;
  addPin: (pin: MapPin) => void;
  updatePin: (pinId: string, updates: Partial<MapPin>) => void;
  removePin: (pinId: string) => void;

  // Actions — sub-maps
  addSubMap: (subMap: SubMap) => void;
  updateSubMap: (subMapId: string, updates: Partial<SubMap>) => void;
  removeSubMap: (subMapId: string) => void;

  // Actions — floors
  addFloor: (subMapId: string, floor: FloorLevel) => void;
  updateFloor: (subMapId: string, floorId: string, updates: Partial<FloorLevel>) => void;
  setFloorOutline: (subMapId: string, floorId: string, outline: EnhancedFloorPlanOutline) => void;
  setFloorWalkabilityGrid: (subMapId: string, floorId: string, grid: SerializedWalkabilityGrid) => void;
  setFloorWalkabilityConfig: (subMapId: string, floorId: string, config: WalkabilityConfig) => void;
  addRoom: (subMapId: string, floorId: string, room: RoomAnnotation) => void;
  updateRoom: (subMapId: string, floorId: string, roomId: string, updates: Partial<RoomAnnotation>) => void;
  removeRoom: (subMapId: string, floorId: string, roomId: string) => void;
  addDoor: (subMapId: string, floorId: string, door: DoorMarker) => void;
  removeDoor: (subMapId: string, floorId: string, doorId: string) => void;

  // Actions — navigation
  navigateToSubMap: (subMapId: string, floorId?: string) => void;
  navigateToMaster: () => void;
  setActiveFloor: (floorId: string) => void;
  setMasterZoom: (zoom: number | ((prev: number) => number)) => void;
  setMasterOffset: (offset: { x: number; y: number }) => void;
  setSubMapZoom: (zoom: number | ((prev: number) => number)) => void;
  setSubMapOffset: (offset: { x: number; y: number }) => void;
  triggerZoomIn: (pin: MapPin) => void;
  triggerZoomOut: () => void;
  clearZoomAnimation: () => void;

  // Actions — rescue
  toggleRescueMode: () => void;
  startPlacingRescuer: () => void;
  startPlacingRescuee: () => void;
  placeRescueMarker: (subMapId: string, floorId: string, x: number, y: number) => void;
  setRescuePath: (segments: RescueOperation['pathSegments']) => void;
  addBlockedCells: (subMapId: string, floorId: string, cells: { col: number; row: number }[]) => void;
  clearBlockedCells: (subMapId: string, floorId: string) => void;
  clearRescue: () => void;
  recalculateRescuePath: () => void;

  // Actions — persistence
  persistProject: () => Promise<void>;

  // Actions — overlay toggles
  toggleWalkabilityOverlay: () => void;
  toggleElementOverlay: () => void;

  // Helpers
  getActiveSubMap: () => SubMap | null;
  getActiveFloor: () => FloorLevel | null;
}

const defaultRescue: RescueOperation = {
  id: uuidv4(),
  rescuer: null,
  rescuee: null,
  pathSegments: [],
  blockedCells: [],
  status: 'idle',
  totalDistance: 0,
  estimatedMinutes: 0,
};

export const useMapProjectStore = create<MapProjectState>((set, get) => ({
  project: null,
  viewLevel: 'master',
  activeSubMapId: null,
  activeFloorId: null,
  masterZoom: 1,
  masterOffset: { x: 0, y: 0 },
  subMapZoom: 1,
  subMapOffset: { x: 0, y: 0 },
  rescue: { ...defaultRescue },
  showWalkabilityOverlay: false,
  showElementOverlay: false,
  isRescueMode: false,
  rescuePlacingFor: null,
  isZoomingIn: false,
  isZoomingOut: false,
  zoomTargetPin: null,

  // ─── Project ───────────────────────────────────────────────
  setProject: (project) => set({ project }),

  updateProject: (updates) => set((state) => ({
    project: state.project ? { ...state.project, ...updates, updatedAt: new Date().toISOString() } : null,
  })),

  // ─── Master Map ────────────────────────────────────────────
  updateMasterMap: (updates) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        masterMap: { ...state.project.masterMap, ...updates },
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  addPin: (pin) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        masterMap: {
          ...state.project.masterMap,
          pins: [...state.project.masterMap.pins, pin],
        },
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  updatePin: (pinId, updates) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        masterMap: {
          ...state.project.masterMap,
          pins: state.project.masterMap.pins.map(p =>
            p.id === pinId ? { ...p, ...updates } : p
          ),
        },
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  removePin: (pinId) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        masterMap: {
          ...state.project.masterMap,
          pins: state.project.masterMap.pins.filter(p => p.id !== pinId),
        },
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  // ─── Sub-Maps ──────────────────────────────────────────────
  addSubMap: (subMap) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: [...state.project.subMaps, subMap],
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  updateSubMap: (subMapId, updates) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId ? { ...s, ...updates } : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  removeSubMap: (subMapId) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.filter(s => s.id !== subMapId),
        masterMap: {
          ...state.project.masterMap,
          pins: state.project.masterMap.pins.filter(p => p.subMapId !== subMapId),
        },
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  // ─── Floors ────────────────────────────────────────────────
  addFloor: (subMapId, floor) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId ? { ...s, floors: [...s.floors, floor] } : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  updateFloor: (subMapId, floorId, updates) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId
            ? { ...s, floors: s.floors.map(f => f.id === floorId ? { ...f, ...updates } : f) }
            : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  setFloorOutline: (subMapId, floorId, outline) =>
    get().updateFloor(subMapId, floorId, { outline }),

  setFloorWalkabilityGrid: (subMapId, floorId, walkabilityGrid) =>
    get().updateFloor(subMapId, floorId, { walkabilityGrid }),

  setFloorWalkabilityConfig: (subMapId, floorId, walkabilityConfig) =>
    get().updateFloor(subMapId, floorId, { walkabilityConfig }),

  addRoom: (subMapId, floorId, room) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId
            ? { ...s, floors: s.floors.map(f => f.id === floorId ? { ...f, rooms: [...f.rooms, room] } : f) }
            : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  updateRoom: (subMapId, floorId, roomId, updates) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId
            ? {
                ...s,
                floors: s.floors.map(f =>
                  f.id === floorId
                    ? { ...f, rooms: f.rooms.map(r => r.id === roomId ? { ...r, ...updates } : r) }
                    : f
                ),
              }
            : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  removeRoom: (subMapId, floorId, roomId) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId
            ? { ...s, floors: s.floors.map(f => f.id === floorId ? { ...f, rooms: f.rooms.filter(r => r.id !== roomId) } : f) }
            : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  addDoor: (subMapId, floorId, door) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId
            ? { ...s, floors: s.floors.map(f => f.id === floorId ? { ...f, doors: [...f.doors, door] } : f) }
            : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  removeDoor: (subMapId, floorId, doorId) => set((state) => {
    if (!state.project) return {};
    return {
      project: {
        ...state.project,
        subMaps: state.project.subMaps.map(s =>
          s.id === subMapId
            ? { ...s, floors: s.floors.map(f => f.id === floorId ? { ...f, doors: f.doors.filter(d => d.id !== doorId) } : f) }
            : s
        ),
        updatedAt: new Date().toISOString(),
      },
    };
  }),

  // ─── Navigation ────────────────────────────────────────────
  navigateToSubMap: (subMapId, floorId) => set((state) => {
    const subMap = state.project?.subMaps.find(s => s.id === subMapId);
    const fId = floorId ?? subMap?.activeFloorId ?? subMap?.floors[0]?.id ?? null;
    return {
      viewLevel: 'submap',
      activeSubMapId: subMapId,
      activeFloorId: fId,
      subMapZoom: 1,
      subMapOffset: { x: 0, y: 0 },
    };
  }),

  navigateToMaster: () => set({
    viewLevel: 'master',
    activeSubMapId: null,
    activeFloorId: null,
    // isRescueMode intentionally preserved — cross-building rescue needs markers to survive navigation
    isZoomingOut: false,
    isZoomingIn: false,
    zoomTargetPin: null,
  }),

  setActiveFloor: (floorId) => set({ activeFloorId: floorId }),
  setMasterZoom: (zoom) => set((s) => ({ masterZoom: typeof zoom === 'function' ? zoom(s.masterZoom) : zoom })),
  setMasterOffset: (offset) => set({ masterOffset: offset }),
  setSubMapZoom: (zoom) => set((s) => ({ subMapZoom: typeof zoom === 'function' ? zoom(s.subMapZoom) : zoom })),
  setSubMapOffset: (offset) => set({ subMapOffset: offset }),

  triggerZoomIn: (pin) => set({ isZoomingIn: true, zoomTargetPin: pin }),
  triggerZoomOut: () => set({ isZoomingOut: true }),
  clearZoomAnimation: () => set({ isZoomingIn: false, isZoomingOut: false, zoomTargetPin: null }),

  // ─── Rescue ────────────────────────────────────────────────
  toggleRescueMode: () => set((state) => ({
    isRescueMode: !state.isRescueMode,
    rescuePlacingFor: null,
  })),

  startPlacingRescuer: () => set({ rescuePlacingFor: 'rescuer' }),
  startPlacingRescuee: () => set({ rescuePlacingFor: 'rescuee' }),

  placeRescueMarker: (subMapId, floorId, x, y) => set((state) => {
    const target = state.rescuePlacingFor;
    if (!target) return {};
    const marker = { subMapId, floorId, x, y };
    return {
      rescue: {
        ...state.rescue,
        [target]: marker,
        status: 'idle',
        pathSegments: [],
        id: target === 'rescuee' ? uuidv4() : state.rescue.id,
      },
      rescuePlacingFor: target === 'rescuer' ? 'rescuee' : null,
    };
  }),

  setRescuePath: (segments) => set((state) => {
    const total = segments.reduce((s, seg) => s + seg.distance, 0);
    return {
      rescue: {
        ...state.rescue,
        pathSegments: segments,
        status: 'active',
        totalDistance: total,
        estimatedMinutes: Math.round((total / 1.2) / 60 * 10) / 10, // ~1.2 m/s walking speed
      },
    };
  }),

  addBlockedCells: (subMapId, floorId, cells) => set((state) => {
    const existing = state.rescue.blockedCells.find(
      b => b.subMapId === subMapId && b.floorId === floorId
    );
    const newBlocked = existing
      ? state.rescue.blockedCells.map(b =>
          b.subMapId === subMapId && b.floorId === floorId
            ? { ...b, cells: [...b.cells, ...cells] }
            : b
        )
      : [...state.rescue.blockedCells, { subMapId, floorId, cells }];

    return {
      rescue: {
        ...state.rescue,
        blockedCells: newBlocked,
        // Clear path so it recalculates
        pathSegments: [],
        status: 'idle',
      },
    };
  }),

  clearBlockedCells: (subMapId, floorId) => set((state) => ({
    rescue: {
      ...state.rescue,
      blockedCells: state.rescue.blockedCells.filter(
        b => !(b.subMapId === subMapId && b.floorId === floorId)
      ),
      pathSegments: [],
      status: 'idle',
    },
  })),

  clearRescue: () => set({
    rescue: { ...defaultRescue, id: uuidv4() },
    isRescueMode: false,
    rescuePlacingFor: null,
  }),

  recalculateRescuePath: () => {
    const { project, rescue } = get();
    if (!project || !rescue.rescuer || !rescue.rescuee) return;
    const segments = computeUniversalPath(
      project,
      rescue.rescuer,
      rescue.rescuee,
      rescue.blockedCells,
    );
    if (segments.length > 0) get().setRescuePath(segments);
  },

  persistProject: async () => {
    const { project } = get();
    if (!project) return;
    await fetch(`/api/maps/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    }).catch(() => {});
  },

  // ─── Overlays ──────────────────────────────────────────────
  toggleWalkabilityOverlay: () => set((s) => ({ showWalkabilityOverlay: !s.showWalkabilityOverlay })),
  toggleElementOverlay: () => set((s) => ({ showElementOverlay: !s.showElementOverlay })),

  // ─── Helpers ───────────────────────────────────────────────
  getActiveSubMap: () => {
    const { project, activeSubMapId } = get();
    return project?.subMaps.find(s => s.id === activeSubMapId) ?? null;
  },

  getActiveFloor: () => {
    const { activeFloorId } = get();
    const subMap = get().getActiveSubMap();
    return subMap?.floors.find(f => f.id === activeFloorId) ?? null;
  },
}));
