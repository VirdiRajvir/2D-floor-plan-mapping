'use client';

import React, { useMemo } from 'react';
import { ChatAgent, type QuickQuestion } from './ChatAgent';

// ─── Props ──────────────────────────────────────────────────────────────────

interface SetupAgentProps {
  /** Current wizard step: 0 = upload, 1 = master/pin, 2 = configure */
  currentStep: 0 | 1 | 2;
  /** Number of images uploaded so far */
  imageCount: number;
  /** Project name entered so far */
  projectName: string;
  /** Number of building pins placed */
  pinCount: number;
  /** Whether a master image has been selected */
  hasMaster: boolean;
}

// ─── Quick questions per step ───────────────────────────────────────────────

const STEP_0_QUESTIONS: QuickQuestion[] = [
  { label: 'How many images?', question: 'How many images do I need to upload to create a project? What should they be?' },
  { label: 'Image format', question: 'What image formats are supported for floor plans?' },
  { label: 'Add images later?', question: 'Can I add more building images later after creating the project?' },
  { label: 'Good master map', question: 'What should my master/campus map image look like for best results?' },
  { label: 'Image size', question: 'What is the recommended image size or resolution for floor plan images?' },
];

const STEP_1_QUESTIONS: QuickQuestion[] = [
  { label: 'What is master map?', question: 'What is a "master map" and how does the hierarchical system work?' },
  { label: 'Place a pin', question: 'How do I place a building pin on the master map?' },
  { label: 'Pin vs Draw Area', question: 'What is the difference between "Pin Point" and "Draw Area" tools?' },
  { label: 'Rename a pin', question: 'How do I rename or edit a building pin label after placing it?' },
  { label: 'Reposition pin', question: 'Can I move or reposition a pin after placing it?' },
];

const STEP_2_QUESTIONS: QuickQuestion[] = [
  { label: 'What is threshold?', question: 'What does the brightness threshold slider do? How should I set it?' },
  { label: 'Wall margin', question: 'What does "wall margin / dilation" mean and how does it affect navigation?' },
  { label: 'Grid resolution', question: 'What does grid resolution affect? Higher vs lower?' },
  { label: 'AI detection', question: 'How does AI element detection work? What does it detect?' },
  { label: 'Door / entry / exit', question: 'What are door, entry point, and exit point annotations used for?' },
];

const QUESTIONS_BY_STEP: Record<number, QuickQuestion[]> = {
  0: STEP_0_QUESTIONS,
  1: STEP_1_QUESTIONS,
  2: STEP_2_QUESTIONS,
};

// ─── System prompt ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the SafeMap Setup Assistant — a friendly, concise AI guide that helps users set up their map projects in the SafeMap disaster-response navigation system.

## About SafeMap
SafeMap is a hierarchical floor plan mapping tool for emergency responders. Users create projects by:
1. **Step 1 — Upload**: Upload multiple images — one campus/site overview (the "master map") and one or more building floor plan images.
2. **Step 2 — Master & Pins**: Select which image is the master map, then place building pins on it to indicate where each building floor plan is located. Two tools are available:
   - **Pin Point**: Click once to place a pin (building center).
   - **Draw Area**: Click and drag to draw a rectangular footprint of the building on the master map.
   Each pin gets a label (building name). Non-master images become sub-maps (buildings).
3. **Step 3 — Configure**: For each building, configure walkability:
   - **Brightness Threshold** (50-250): Pixels brighter than this value become walkable (green). Lower = more walkable area. Walls and dark areas become blocked (red).
   - **Wall Margin / Dilation** (0-6px): Extra buffer around walls. Prevents the pathfinder from squeezing through narrow gaps. 2px is usually good.
   - **Grid Resolution** (50-300): Number of cells across the grid. Higher = more precise pathfinding but slower. 150 is a good default.
   - **AI Element Detection** (optional): Uses OpenAI GPT-4o vision to detect walls, doors, windows, balconies, stairs, corridors, and restricted zones. Requires an OpenAI API key configured in Settings.
   - **Annotations** (optional): Manually place door markers (🚪), entry points (↙), and exit points (↗) on each floor. Entry/exit points enable cross-building rescue routing.

## Your behaviour
- Be CONCISE — 2-4 sentences per answer unless the user asks for detail.
- Use simple language — the user might be a non-technical emergency responder or facility manager.
- If the user is confused, refer them to specific UI elements by name (e.g. "click the 'Pin Point' button", "adjust the Brightness Threshold slider").
- NEVER make up features that don't exist.
- If they ask about something outside setup (like rescue mode, red zones, pathfinding), briefly explain it but note that those features are available after project creation on the map viewer page.
- Use markdown formatting: bold for UI element names, numbered lists for steps.`;

// ─── Component ──────────────────────────────────────────────────────────────

export function SetupAgent({ currentStep, imageCount, projectName, pinCount, hasMaster }: SetupAgentProps) {
  const stepNames = ['Upload Images', 'Master Map & Pins', 'Configure Walkability'];

  const context = useMemo(() => JSON.stringify({
    page: 'Setup Wizard',
    currentStep: currentStep + 1,
    currentStepName: stepNames[currentStep],
    projectName: projectName || '(not set yet)',
    imagesUploaded: imageCount,
    hasMasterImage: hasMaster,
    buildingPinsPlaced: pinCount,
  }), [currentStep, imageCount, projectName, pinCount, hasMaster]);

  const questions = QUESTIONS_BY_STEP[currentStep] ?? STEP_0_QUESTIONS;

  return (
    <ChatAgent
      variant="setup"
      systemPrompt={SYSTEM_PROMPT}
      context={context}
      quickQuestions={questions}
      title="Setup Assistant"
      subtitle={`Step ${currentStep + 1}: ${stepNames[currentStep]}`}
    />
  );
}
