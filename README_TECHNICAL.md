# SafeMap: Technical Documentation

## 1) Technology stack

- Next.js App Router (v16)
- React 19 + TypeScript
- Zustand for global state
- Tailwind CSS v4
- Papa Parse for CSV parsing
- OpenAI SDK for floor-plan vision extraction
- uuid for IDs

Project scripts are standard Next.js (`dev`, `build`, `start`, `lint`).

---

## 2) Runtime architecture

## Frontend routes

- `/` → multi-step mapping wizard (dashboard)
- `/extract` → floor-plan extraction workflow
- `/navigate` → single-image walkability + A* navigation

## Backend API routes

- `/api/upload`
  - uploads files via `FormData`
  - stores files under `public/uploads`

- `/api/process-csv`
  - server-side CSV parsing + IMU path computation
  - returns path points, distance, duration

- `/api/extract-floorplan`
  - accepts image + API key + options
  - calls extraction pipeline
  - returns JSON outline and/or SVG

---

## 3) Core data model

Defined in `src/lib/types.ts`.

Key entities:

- `FloorPlan`
  - image metadata
  - ordered placement
  - markers: `exitPoint`, `entryPoint`, optional `eps32Point`
  - optional extracted geometry (`outline`)

- `Transition`
  - directed connection from room A to room B
  - supports multiple datasets (`TransitionDataset[]`)
  - selected dataset is mirrored to transition summary fields

- `TransitionDataset`
  - per-pathway CSV set + processed path

- `TransitionPath`
  - ordered points with aggregate `totalDistance` and `duration`

This allows a directed room graph with multi-sample pathway variants per edge.

---

## 4) Global state and orchestration

`src/store/mapStore.ts` implements a centralized Zustand store.

State domains:

- wizard step
- floor plans
- transitions + datasets
- selected items
- map transform state
- processing flags

Important patterns:

- `syncTransitionSummary()` keeps transition-level fields synchronized to selected dataset.
- Room deletion prunes invalid transitions automatically.
- Dataset operations (add/remove/select) are first-class store actions.
- Floor-plan upload cap enforced in state (`<= 5`).

---

## 5) UI architecture by component

- `Dashboard.tsx`
  - wizard shell, step indicator, top-level navigation

- `FloorPlanUploader.tsx`
  - image ingest, rename, remove

- `SequenceManager.tsx`
  - drag reorder + button reorder

- `TransitionEditor.tsx`
  - connection creation
  - marker placement (entry/exit/EPS32)
  - pathway dataset management
  - CSV upload + processing trigger

- `InteractiveMap.tsx`
  - SVG room rendering
  - connector/path rendering
  - room drag positioning
  - walkable region approximation and player simulation
  - EPS32 random-event highlight

- `FloorPlanExtractorUI.tsx`
  - extractor control panel
  - pass count tuning
  - render modes and downloads

- `NavigableMap.tsx`
  - canvas-based movement and pathfinding on one walkability grid

---

## 6) Sensor-data path pipeline

## Input

`TransitionEditor.tsx` supports:

- folder upload with filename heuristics,
- or explicit single-file upload for required channels.

Required channels for processing:

- `linearAccelerometer`
- `gyroscope`

## Parsing

`src/lib/csvParser.ts`:

- `Papa.parse` with headers + dynamic typing
- extracts first 4 columns into `time,x,y,z`
- skips malformed rows

## Estimation

`src/lib/pathCalculator.ts` implements dead-reckoning style estimation:

1. moving-average smoothing,
2. timestamp interpolation between streams,
3. heading integration from gyro Z,
4. frame rotation to world acceleration,
5. velocity integration,
6. ZUPT-like velocity reset under low acceleration,
7. position integration,
8. distance accumulation,
9. sanity scaling using walking-speed heuristic.

Also provides normalization and fallback synthetic path generation helpers.

---

## 7) Interactive multi-room map internals

`src/components/InteractiveMap.tsx` is SVG-first.

Major mechanics:

1. Room layout
   - auto-layout with fixed constants
   - optional manual positions override auto layout

2. Transition drawing
   - derive anchor points from room markers
   - remap stored trajectory from local path coordinates to map anchors
   - offset parallel edges for readability
   - render direction arrows and distance tags

3. Walkability approximation for avatar
   - walkable set = room rectangles + corridor tubes around connectors
   - movement loop via `requestAnimationFrame`
   - motion clamped to closest walkable point

4. EPS32 event simulation
   - random EPS32 marker selection
   - transient visual alert overlay

---

## 8) Single-map navigation mode internals

## Grid generation

`src/lib/imageProcessor.ts`:

- downsample image to grid resolution
- threshold brightness to walkable/blocked boolean cells
- wall dilation expands blocked areas for safety margin
- returns `WalkabilityGrid`

## Pathfinding

`src/lib/pathfinder.ts`:

- A* with 8-direction movement
- octile heuristic
- no corner-cutting on diagonals
- nearest-walkable fallback for blocked start/end
- optional smoothing via line-of-sight pruning

## Rendering/input

`src/components/NavigableMap.tsx`:

- canvas render stack: base image, overlay, labels, route, markers
- controls: click place, right-click destination, WASD movement
- zoom/pan and route distance estimate

---

## 9) Floor-plan extraction pipeline

`src/lib/floorplanExtractor.ts` defines the extraction contract and rendering utilities.

Expected output schema:

- `outerBoundary`
- `walls`
- `obstacles`
- `rooms` (label + center + door position)
- `corridorCenterline`

Pipeline characteristics:

- strict geometry-oriented prompt
- optional multi-pass refinement (`passes` 1..3)
- robust response cleanup + JSON extraction
- coordinate clamping and degenerate geometry filtering
- output renderers: SVG and canvas draw ops

`/extract` UI provides side-by-side, overlay, and outline-only visualization modes.

---

## 10) Walkability utilities for extracted geometry

`src/lib/walkabilityGrid.ts` provides geometry-to-grid rasterization using `OffscreenCanvas`:

- fills outer boundary as walkable
- paints walls/obstacles as blocked
- exports grid-space conversion helpers
- supports overlay rendering helpers

This module can bridge extraction output into navigation/pathfinding pipelines.

---

## 11) Notable engineering observations

- There is overlap between server and client CSV/path logic (`/api/process-csv` vs `pathCalculator.ts`).
- App state is session-memory (Zustand), not persistent DB-backed state.
- Upload API persists static files to `public/uploads`.
- Browser APIs like `OffscreenCanvas` are used in multiple places.
- Extractor currently passes API key from client request payload.

---

## 12) Suggested technical next steps

1. Consolidate path-calculation logic into one shared module used by both client and server.
2. Add boundary/schema validation for all API payloads and responses.
3. Add tests for:
   - A* correctness and smoothing,
   - IMU integration stability,
   - remap/transform geometry logic.
4. Add persistent project storage (database or project snapshot files).
5. Harden key management for extraction flow in production deployment.

---

## 13) Fast file index

- State: `src/store/mapStore.ts`
- Types: `src/lib/types.ts`
- CSV parsing: `src/lib/csvParser.ts`
- Path calculation: `src/lib/pathCalculator.ts`
- Pathfinding: `src/lib/pathfinder.ts`
- Walkability from image: `src/lib/imageProcessor.ts`
- Walkability from extracted geometry: `src/lib/walkabilityGrid.ts`
- Extraction core: `src/lib/floorplanExtractor.ts`
- Wizard shell: `src/components/Dashboard.tsx`
- Transition workflow: `src/components/TransitionEditor.tsx`
- Main map: `src/components/InteractiveMap.tsx`
- Navigate map: `src/components/NavigableMap.tsx`
- Extractor UI: `src/components/FloorPlanExtractorUI.tsx`
