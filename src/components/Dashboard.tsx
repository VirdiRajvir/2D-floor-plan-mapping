'use client';

import React from 'react';
import { useMapStore } from '@/store/mapStore';
import { WIZARD_STEPS, WizardStep } from '@/lib/types';
import FloorPlanUploader from './FloorPlanUploader';
import SequenceManager from './SequenceManager';
import TransitionEditor from './TransitionEditor';
import InteractiveMap from './InteractiveMap';

function StepIndicator({ steps, currentStep, onStepClick }: {
  steps: typeof WIZARD_STEPS;
  currentStep: WizardStep;
  onStepClick: (step: WizardStep) => void;
}) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((step, index) => {
        const isActive = step.key === currentStep;
        const isCompleted = index < currentIdx;
        const isClickable = true;

        return (
          <React.Fragment key={step.key}>
            <button
              onClick={() => isClickable && onStepClick(step.key)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? 'bg-blue-600/20 border border-blue-500/50'
                  : isCompleted
                  ? 'bg-green-600/10 border border-green-500/20 hover:border-green-500/40'
                  : 'bg-gray-800/50 border border-gray-700/50 hover:border-gray-600'
              } ${isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isCompleted
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <div className="text-left hidden sm:block">
                <p className={`text-sm font-medium ${isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-gray-400'}`}>
                  {step.label}
                </p>
              </div>
            </button>
            {index < steps.length - 1 && (
              <div className={`w-8 h-0.5 ${index < currentIdx ? 'bg-green-600' : 'bg-gray-700'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { currentStep, setCurrentStep, floorPlans, transitions } = useMapStore();

  const canGoNext = () => {
    switch (currentStep) {
      case 'upload':
        return floorPlans.length >= 2;
      case 'sequence':
        return floorPlans.length >= 2;
      case 'transitions':
        return true;
      case 'map':
        return false;
      default:
        return false;
    }
  };

  const canGoPrev = () => {
    return currentStep !== 'upload';
  };

  const goNext = () => {
    const steps: WizardStep[] = ['upload', 'sequence', 'transitions', 'map'];
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      setCurrentStep(steps[idx + 1]);
    }
  };

  const goPrev = () => {
    const steps: WizardStep[] = ['upload', 'sequence', 'transitions', 'map'];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(steps[idx - 1]);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'upload':
        return <FloorPlanUploader />;
      case 'sequence':
        return <SequenceManager />;
      case 'transitions':
        return <TransitionEditor />;
      case 'map':
        return <InteractiveMap />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Top bar */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">SafeMap</h1>
              <p className="text-gray-500 text-xs">Administrator Safety Monitoring System</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a
              href="/extract"
              className="px-3 py-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-600/30 transition-colors font-medium"
            >
              Floor Plan Extractor
            </a>
            <div className="flex items-center gap-2 text-gray-400">
              <div className={`w-2 h-2 rounded-full ${floorPlans.length > 0 ? 'bg-green-500' : 'bg-gray-600'}`} />
              {floorPlans.length} Room{floorPlans.length !== 1 ? 's' : ''}
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <div className={`w-2 h-2 rounded-full ${transitions.some((t) => t.processed) ? 'bg-green-500' : 'bg-gray-600'}`} />
              {transitions.filter((t) => t.processed).length}/{transitions.length} Paths
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <StepIndicator steps={WIZARD_STEPS} currentStep={currentStep} onStepClick={setCurrentStep} />

        <div className="min-h-[500px]">{renderStep()}</div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800">
          <button
            onClick={goPrev}
            disabled={!canGoPrev()}
            className="flex items-center gap-2 px-6 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 rounded-xl font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          {currentStep !== 'map' && (
            <button
              onClick={goNext}
              disabled={!canGoNext()}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors"
            >
              Next
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {currentStep === 'map' && (
            <button
              onClick={() => {
                // Export map data
                const data = {
                  floorPlans: floorPlans.map((p) => ({
                    name: p.name,
                    order: p.order,
                    exitPoint: p.exitPoint,
                    entryPoint: p.entryPoint,
                  })),
                  transitions: transitions.map((t) => ({
                    from: floorPlans.find((p) => p.id === t.fromRoomId)?.name,
                    to: floorPlans.find((p) => p.id === t.toRoomId)?.name,
                    distance: t.path?.totalDistance,
                    duration: t.path?.duration,
                    pathPoints: t.path?.points.length,
                  })),
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'safemap-export.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Map Data
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
