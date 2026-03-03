declare module '@mkkellogg/gaussian-splats-3d' {
  export class Viewer {
    constructor(options?: {
      cameraUp?: number[];
      initialCameraPosition?: number[];
      initialCameraLookAt?: number[];
      rootElement?: HTMLElement;
      sharedMemoryForWorkers?: boolean;
      [key: string]: unknown;
    });
    addSplatScene(url: string, options?: Record<string, unknown>): Promise<void>;
    start(): void;
    dispose(): void;
  }
}
