export interface SensorReading {
  time: number;
  x: number;
  y: number;
  z: number;
}

export interface PathPoint {
  x: number;
  y: number;
  time: number;
}

export interface TransitionPath {
  points: PathPoint[];
  totalDistance: number;
  duration: number;
}

export interface TransitionCsvFiles {
  linearAccelerometer?: File;
  gyroscope?: File;
  accelerometer?: File;
  gravity?: File;
}

export interface TransitionDataset {
  id: string;
  name: string;
  csvFiles: TransitionCsvFiles;
  path: TransitionPath | null;
  processed: boolean;
}

export interface MarkerPoint {
  x: number; // percentage 0-100 on the image
  y: number; // percentage 0-100 on the image
}

export interface RoomInfo {
  label: string;
  center: { x: number; y: number };       // normalized 0-1
  doorPosition: { x: number; y: number };  // normalized 0-1
}

import type { FloorPlanOutline } from './floorplanExtractor';

export interface FloorPlan {
  id: string;
  name: string;
  imageUrl: string;
  file: File | null;
  order: number;
  exitPoint: MarkerPoint | null;
  entryPoint: MarkerPoint | null;
  eps32Point?: MarkerPoint | null; // Blue dot location
  width: number;
  height: number;
  position?: { x: number; y: number }; // Manual position override
  outline?: FloorPlanOutline | null; // Wall/obstacle data
}

export interface Transition {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  datasets: TransitionDataset[];
  selectedDatasetId: string | null;
  csvFiles: TransitionCsvFiles;
  path: TransitionPath | null;
  processed: boolean;
}

export interface MapState {
  floorPlans: FloorPlan[];
  transitions: Transition[];
  currentStep: number;
  selectedFloorPlanId: string | null;
  selectedTransitionId: string | null;
  mapScale: number;
  mapOffset: { x: number; y: number };
}

export type WizardStep = 'upload' | 'sequence' | 'transitions' | 'map';

export const WIZARD_STEPS: { key: WizardStep; label: string; description: string }[] = [
  { key: 'upload', label: 'Upload Floor Plans', description: 'Upload up to 5 floor plan images' },
  { key: 'sequence', label: 'Arrange Sequence', description: 'Define the order of rooms' },
  { key: 'transitions', label: 'Configure Transitions', description: 'Upload sensor data & mark entry/exit points' },
  { key: 'map', label: 'View Map', description: 'Interactive safety monitoring map' },
];

// ─────────────────────────────────────────────────────────────
// HIERARCHICAL MAP SYSTEM — New types
// ─────────────────────────────────────────────────────────────

/** A walkable/blocked element type in a floor plan */
export type ElementType = 'wall' | 'door' | 'window' | 'balcony' | 'restricted' | 'stair' | 'corridor';

/** Passability rules per element type */
export const ELEMENT_PASSABILITY: Record<ElementType, boolean> = {
  wall: false,
  door: true,       // open by default
  window: false,
  balcony: false,   // non-enterable outdoor area
  restricted: false,
  stair: true,      // transition point (passable but special)
  corridor: true,
};

/** A door element extracted from a floor plan */
export interface DoorElement {
  id: string;
  x: number;   // normalized 0-1 center position
  y: number;
  wallNormal: 'n' | 's' | 'e' | 'w'; // direction the door opens
  width: number; // normalized width
  isOpen: boolean;
  linkedRoomIds?: string[];
}

/** A window element on a wall */
export interface WindowElement {
  id: string;
  x1: number; y1: number;
  x2: number; y2: number;
}

/** A polygon region (balcony, restricted zone, stairwell, corridor) */
export interface RegionElement {
  id: string;
  type: 'balcony' | 'restricted' | 'stair' | 'corridor';
  polygon: { x: number; y: number }[];
  label?: string;
  passable: boolean;
}

/** Enhanced floor plan outline with full element classification */
export interface EnhancedFloorPlanOutline {
  walls: import('./floorplanExtractor').WallSegment[];
  doors: DoorElement[];
  windows: WindowElement[];
  balconies: RegionElement[];
  restrictedZones: RegionElement[];
  stairs: RegionElement[];
  corridors: RegionElement[];
  outerBoundary: { x: number; y: number }[];
  rooms: {
    id: string;
    label: string;
    center: { x: number; y: number };
    doorPosition: { x: number; y: number };
  }[];
  width: number;
  height: number;
}

/** A 3D model asset (PLY, OBJ, or Gaussian splat) */
export type Model3DFormat = 'ply' | 'obj' | 'splat';
export interface Model3DAsset {
  url: string;          // path to the uploaded file (e.g. /uploads/model.ply)
  format: Model3DFormat;
  label?: string;       // display name
  renderMode?: 'mesh' | 'splat'; // mesh for PLY/OBJ, splat for Gaussian
}

/** Room annotation within a floor level */
export interface RoomAnnotation {
  id: string;
  label: string;
  cx: number;  // normalized 0-1 center
  cy: number;
  color?: string;
  type?: string;  // e.g. "lab", "office", "corridor", "stairwell"
  model3D?: Model3DAsset; // optional 3D reconstruction
  /** Hierarchical sub-rooms within this room (room-within-room) */
  subRooms?: RoomAnnotation[];
  /** Optional image for this room's interior (enables sub-room navigation) */
  subFloorImageUrl?: string;
  subFloorWidth?: number;
  subFloorHeight?: number;
}

/** Door marker in a floor level — may link to another sub-map */
export interface DoorMarker {
  id: string;
  x: number;  // normalized 0-1
  y: number;
  linkedPinId?: string;  // if this door leads to another building via a master map pin
  linkedSubMapId?: string;
  label?: string;
}

/** Stair connection between floors in the same building */
export interface StairConnection {
  id: string;
  fromFloorId: string;
  toFloorId: string;
  fromPosition: { x: number; y: number };  // normalized
  toPosition: { x: number; y: number };
  label?: string;
}

/** Serialized walkability grid (safe to JSON stringify) */
export interface SerializedWalkabilityGrid {
  grid: boolean[][];
  rows: number;
  cols: number;
  cellW: number;
  cellH: number;
  imageWidth: number;
  imageHeight: number;
}

/** Walkability configuration for a floor level */
export interface WalkabilityConfig {
  threshold: number;   // brightness threshold 0-255
  dilation: number;    // wall dilation cells
  resolution: number;  // grid cells along longest axis
}

/** A single floor within a building */
export interface FloorLevel {
  id: string;
  floorNumber: number;
  label: string;   // e.g. "Ground Floor", "Floor 1", "Basement"
  imageUrl: string;
  width: number;
  height: number;
  walkabilityConfig: WalkabilityConfig;
  walkabilityGrid?: SerializedWalkabilityGrid;
  outline?: EnhancedFloorPlanOutline;
  rooms: RoomAnnotation[];
  doors: DoorMarker[];
  stairConnections: StairConnection[];
  entryPoints: MarkerPoint[];
  exitPoints: MarkerPoint[];
  permanentBlockedZones?: { id: string; x: number; y: number; w: number; h: number }[];
}

/** An individual building/room sub-map (may have multiple floors) */
export interface SubMap {
  id: string;
  name: string;
  floors: FloorLevel[];
  activeFloorId: string;
}

/** A pin on the master map that links to a SubMap or opens a 3D viewer */
export interface MapPin {
  id: string;
  label: string;
  x: number;  // normalized 0-1 on master map
  y: number;
  subMapId: string;  // links to SubMap (empty string if 3D-only pin)
  footprint?: {
    x: number; y: number;
    width: number; height: number;
  };
  geoAnchor?: { lat: number; lng: number };  // future: real-world coordinates
  color?: string;
  icon?: 'building' | 'lab' | 'office' | 'emergency' | 'default' | '3d';
  model3D?: Model3DAsset; // optional 3D reconstruction
}

/** The campus/site overview map (Level 1) */
export interface MasterMap {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  pins: MapPin[];
}

/** Top-level map project */
export interface MapProject {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  masterMap: MasterMap;
  subMaps: SubMap[];
  thumbnail?: string;
}

/** A segment of a rescue path on a specific floor */
export interface RescuePathSegment {
  subMapId: string;
  floorId: string;
  points: { x: number; y: number }[];  // normalized 0-1
  distance: number;  // meters equivalent
  type: 'walk' | 'stairs' | 'transition';  // transition = cross-building
}

/** A rescue operation */
export interface RescueOperation {
  id: string;
  rescuer: {
    subMapId: string;
    floorId: string;
    x: number; y: number;
  } | null;
  rescuee: {
    subMapId: string;
    floorId: string;
    x: number; y: number;
  } | null;
  pathSegments: RescuePathSegment[];
  blockedCells: {
    subMapId: string;
    floorId: string;
    cells: { col: number; row: number }[];
  }[];
  status: 'idle' | 'calculating' | 'active' | 'completed';
  totalDistance: number;
  estimatedMinutes: number;
}

/** Setup wizard step */
export type SetupStep = 'upload' | 'master' | 'configure';

export const SETUP_STEPS: { key: SetupStep; label: string; description: string }[] = [
  { key: 'upload', label: 'Upload Images', description: 'Upload your campus and building floor plan images' },
  { key: 'master', label: 'Place Pins', description: 'Select the master map and place building pins' },
  { key: 'configure', label: 'Configure Maps', description: 'Detect walls, doors, and configure each floor plan' },
];
