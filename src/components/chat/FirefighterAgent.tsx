'use client';

import React, { useMemo } from 'react';
import { ChatAgent, type QuickQuestion } from './ChatAgent';
import { useMapProjectStore } from '@/store/mapProjectStore';

// ─── Quick questions ────────────────────────────────────────────────────────

const MASTER_VIEW_QUESTIONS: QuickQuestion[] = [
  { label: 'Enter building', question: 'How do I enter a building to see its floor plan?' },
  { label: 'What are pins?', question: 'What do the pins on my campus map represent?' },
  { label: 'Start rescue', question: 'How do I start a rescue route from the master map?' },
  { label: 'Edit project', question: 'How can I edit my project or add more buildings?' },
  { label: 'Zoom controls', question: 'How do I zoom and pan on the map?' },
];

const SUBMAP_QUESTIONS: QuickQuestion[] = [
  { label: 'Back to campus', question: 'How do I go back to the campus/master map?' },
  { label: 'Switch floors', question: 'How do I switch between floors in this building?' },
  { label: 'Start a rescue', question: 'How do I calculate a rescue route to reach a victim?' },
  { label: 'Block an area', question: 'How do I mark an area as blocked or dangerous?' },
  { label: 'Add room label', question: 'How do I add a room label/pin to this floor plan?' },
];

const RESCUE_QUESTIONS: QuickQuestion[] = [
  { label: 'No path found', question: 'Why is no rescue path being found? What should I check?' },
  { label: 'Place markers', question: 'How do I place the rescuer and victim markers?' },
  { label: 'Red vs blocked', question: 'What is the difference between permanent red zones and blocked zones?' },
  { label: 'Cross-building', question: 'Can I route a rescue across different buildings? How?' },
  { label: 'Alternative route', question: 'The suggested route passes through a dangerous area. How do I force an alternative route?' },
  { label: 'Clear rescue', question: 'How do I clear the current rescue and start over?' },
];

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the SafeMap Firefighter Assistant — a tactical AI advisor for firefighters and emergency responders using the SafeMap floor plan navigation system during real operations.

## About SafeMap
SafeMap displays hierarchical floor plan maps: a master campus map with building pins that zoom into individual buildings, which have floor levels. Each floor has a walkability grid (green = passable, red = walls/obstacles) and optionally AI-detected structural elements (walls, doors, windows, balconies, stairs, corridors, restricted zones).

## Key Features You Can Help With

### Navigation
- **Master map**: Shows the campus/site overview with building pins. Click a pin to zoom into that building.
- **Sub-map (building view)**: Shows the floor plan with walkability overlay. Use **breadcrumb** at top-left (click project name) to go back to master.
- **Floor selector**: When a building has multiple floors, a floor switcher appears in the top bar.
- **Pan/Zoom**: Scroll to zoom, click+drag to pan.

### Rescue Mode
- Toggle with the **🔥 Rescue** button in the top bar.
- **Place Rescuer** (blue marker): Click the "Place Rescuer" button in the rescue panel, then click on the floor plan.
- **Place Rescuee/Victim** (red marker): Same process with "Place Rescuee".
- Once both markers are placed, A* pathfinding automatically calculates the shortest walkable route.
- The **rescue panel** (right sidebar) shows: distance, estimated time, step-by-step directions, and a tracking simulator.

### Blocked Areas
- **Permanent Red Zones** (⛔): Click "⛔ Red Zone" button → drag a rectangle on the floor plan. These persist across sessions and permanently block pathfinding through that area.
- **Session Blocked Zones**: In rescue mode, use the blocked zone tool to temporarily mark fire/hazard zones. These only last for the current rescue operation.
- Both types cause auto-recalculation of the rescue path.

### Cross-Floor Routing
- If rescuer and victim are on different floors of the same building, the path uses **stair connections** (must be configured).
- Path shows: walk → 🪜 stairs → walk segments.

### Cross-Building Routing
- If rescuer and victim are in different buildings, the path uses **entry/exit points** (must be configured during setup).
- Path shows: walk → 🏃 transition → walk segments.
- Requires at least one exit point on the rescuer's floor and one entry point on the victim's floor.

### Room Pins
- Click "📍 Pin Location" → click on the floor plan → type a label → Enter to confirm.
- Useful for marking rooms, stairwells, exits, or points of interest.

### Overlays
- **Walkability overlay** (green/red grid): Shows which areas are walkable vs blocked based on brightness analysis.
- **Element overlay** (colored outlines): Shows AI-detected walls, doors, windows, etc. Requires AI detection to have been run during setup.

## Your Behaviour
- Be CONCISE and TACTICAL — firefighters need quick, actionable answers. 1-3 sentences.
- If there's an active rescue, prioritize answers relevant to the current situation.
- When suggesting routes or actions, mention UI controls by name.
- If the user reports "no path found", suggest checking: (1) both markers placed on walkable areas, (2) path not completely blocked by red/blocked zones, (3) for cross-building routes — ensure entry/exit points exist.
- Use bold for UI elements, bullet points for steps.
- The user may be under stress — be direct, calm, and professional.
- NEVER invent features that don't exist. If something isn't possible, say so clearly and suggest a workaround.`;

// ─── Component ──────────────────────────────────────────────────────────────

export function FirefighterAgent() {
  const {
    project,
    viewLevel,
    activeSubMapId,
    activeFloorId,
    isRescueMode,
    rescue,
    showWalkabilityOverlay,
    showElementOverlay,
  } = useMapProjectStore();

  // Build context snapshot
  const context = useMemo(() => {
    if (!project) return JSON.stringify({ page: 'Map Viewer', status: 'No project loaded' });

    const activeSubMap = project.subMaps.find(s => s.id === activeSubMapId);
    const activeFloor = activeSubMap?.floors.find(f => f.id === activeFloorId);

    const rooms = activeFloor?.rooms.map(r => r.label) ?? [];
    const hasOutline = !!activeFloor?.outline;
    const floorCount = activeSubMap?.floors.length ?? 0;
    const buildingCount = project.subMaps.length;
    const redZoneCount = activeFloor?.permanentBlockedZones?.length ?? 0;

    return JSON.stringify({
      page: 'Map Viewer',
      projectName: project.name,
      viewLevel,
      buildingCount,
      ...(viewLevel === 'submap' && activeSubMap ? {
        currentBuilding: activeSubMap.name,
        currentFloor: activeFloor?.label ?? 'Unknown',
        floorCount,
        rooms: rooms.length > 0 ? rooms : '(no rooms labelled)',
        permanentRedZones: redZoneCount,
        hasAIElementDetection: hasOutline,
      } : {}),
      overlays: {
        walkability: showWalkabilityOverlay ? 'ON' : 'OFF',
        elements: showElementOverlay ? 'ON' : 'OFF',
      },
      rescueMode: isRescueMode,
      ...(isRescueMode ? {
        rescuerPlaced: !!rescue.rescuer,
        rescueePlaced: !!rescue.rescuee,
        pathFound: rescue.pathSegments.length > 0,
        pathSegments: rescue.pathSegments.length,
        totalDistance: rescue.totalDistance,
        estimatedMinutes: rescue.estimatedMinutes,
        blockedCells: rescue.blockedCells.length,
        rescueStatus: rescue.status,
        ...(rescue.rescuer ? {
          rescuerBuilding: project.subMaps.find(s => s.id === rescue.rescuer?.subMapId)?.name ?? 'Unknown',
          rescuerFloor: project.subMaps
            .find(s => s.id === rescue.rescuer?.subMapId)
            ?.floors.find(f => f.id === rescue.rescuer?.floorId)?.label ?? 'Unknown',
        } : {}),
        ...(rescue.rescuee ? {
          rescueeBuilding: project.subMaps.find(s => s.id === rescue.rescuee?.subMapId)?.name ?? 'Unknown',
          rescueeFloor: project.subMaps
            .find(s => s.id === rescue.rescuee?.subMapId)
            ?.floors.find(f => f.id === rescue.rescuee?.floorId)?.label ?? 'Unknown',
        } : {}),
      } : {}),
    });
  }, [project, viewLevel, activeSubMapId, activeFloorId, isRescueMode, rescue, showWalkabilityOverlay, showElementOverlay]);

  // Pick appropriate quick questions
  const questions = useMemo(() => {
    if (isRescueMode) return RESCUE_QUESTIONS;
    if (viewLevel === 'submap') return SUBMAP_QUESTIONS;
    return MASTER_VIEW_QUESTIONS;
  }, [isRescueMode, viewLevel]);

  const subtitle = useMemo(() => {
    if (isRescueMode) return 'Rescue Mode Active';
    if (viewLevel === 'submap') {
      const name = project?.subMaps.find(s => s.id === activeSubMapId)?.name ?? 'Building';
      return `Viewing: ${name}`;
    }
    return 'Campus Overview';
  }, [isRescueMode, viewLevel, project, activeSubMapId]);

  return (
    <ChatAgent
      variant="firefighter"
      systemPrompt={SYSTEM_PROMPT}
      context={context}
      quickQuestions={questions}
      title="Firefighter Assistant"
      subtitle={subtitle}
      model="gpt-4o-mini"
    />
  );
}
