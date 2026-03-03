# SafeMap: Non-Technical Guide

## What this product is

SafeMap is an indoor safety mapping tool. It helps teams turn floor-plan images and movement logs into an interactive map that shows:

- rooms,
- transitions between rooms,
- estimated walking paths,
- and monitored points for emergency-style events.

It is designed for operational users (facility, safety, and admin teams), not only developers.

---

## What users can do

SafeMap has three main user experiences:

## 1) Main mapping workflow (home page)

This is a guided 4-step process.

### Step 1: Upload floor plans
- Upload up to 5 room/floor images.
- Rename each room so the map is easy to understand.

### Step 2: Arrange room sequence
- Drag and reorder rooms.
- This defines default visual ordering in the map view.

### Step 3: Configure room connections
- Create links from one room to another.
- For each room image, place key points:
  - Exit point
  - Entry point
  - EPS32 point (blue marker used for event simulation)
- Upload motion sensor CSV files for each connection/pathway.
- System processes those files and estimates path, distance, and duration.

### Step 4: View interactive map
- See all rooms and pathways in one view.
- Move a simulated person with keyboard controls.
- Trigger a random EPS32 event to highlight a monitored location.
- Export map summary data.

---

## 2) Floor Plan Extractor page

This page converts a raw floor-plan image into clean structural output:

- outer boundary,
- interior walls,
- obstacles/furniture,
- room labels and door positions,
- corridor centerline.

It can export results as JSON, SVG, and PNG.

---

## 3) Navigate page

This is a fast sandbox for one floor-plan image.

- Upload one image.
- Tune walkable vs blocked areas using sliders.
- See a red/green overlay.
- Place a user location and navigate.
- Right-click to compute shortest path.

This mode runs directly in the browser and is optimized for quick testing.

---

## How the system works (high level)

1. Users provide room visuals (floor plans).
2. Users define room-to-room connections.
3. Users mark entry/exit anchors on maps.
4. Users upload sensor logs for movement.
5. System estimates movement paths from sensor data.
6. System overlays those paths onto the room graph.
7. Final map becomes interactive for monitoring and navigation.

In short: SafeMap combines building layout + movement evidence + user-defined semantics.

---

## Who this is for

- Safety administrators
- Facility managers
- Operations teams
- Demo/training teams validating movement scenarios

---

## Practical strengths

- Visual workflow with clear steps
- Supports multiple room connections
- Supports multiple datasets per connection
- Immediate interactive feedback
- Exportable structured map data

---

## Current limitations

- Path estimation is approximate (sensor drift is normal indoors)
- Results depend on CSV quality and marker placement quality
- Maximum of 5 uploaded floor plans in the main flow
- Floor-plan extraction needs a valid OpenAI API key

---

## Typical workflow in an organization

1. Team uploads room plans.
2. Team arranges room order and names.
3. Team defines transitions and marks entry/exit points.
4. Team uploads walking sensor logs.
5. Team validates distances, durations, and routes.
6. Team runs scenarios in interactive mode and exports data.

---

## One-line summary

SafeMap is a guided indoor safety-mapping system that transforms floor plans and sensor logs into an interactive operational map for monitoring, route analysis, and scenario simulation.
