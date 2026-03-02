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
