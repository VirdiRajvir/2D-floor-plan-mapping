'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { MapProject, Model3DAsset } from '@/lib/types';
import { useMapProjectStore } from '@/store/mapProjectStore';
import { MasterMapView } from './MasterMapView';
import { SubMapView } from './SubMapView';

interface Props {
  project: MapProject;
  on3DPinClick?: (asset: Model3DAsset) => void;
  isSetupMode?: boolean;
  simPosition?: { x: number; y: number } | null;
  simPlaying?: boolean;
}

/**
 * HierarchicalMapCanvas — The core viewer component.
 *
 * Manages the two-level view: Master Map (campus) ↔ Sub Map (building).
 * Handles the seamless zoom-in / zoom-out transition animation.
 */
export function HierarchicalMapCanvas({ project, on3DPinClick, isSetupMode, simPosition, simPlaying }: Props) {
  const {
    viewLevel,
    activeSubMapId,
    activeFloorId,
    isZoomingIn,
    isZoomingOut,
    zoomTargetPin,
    navigateToSubMap,
    navigateToMaster,
    clearZoomAnimation,
    getActiveSubMap,
    getActiveFloor,
  } = useMapProjectStore();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({});
  const [transitioning, setTransitioning] = useState(false);
  const [showSubMap, setShowSubMap] = useState(false);
  const transitionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clear any pending transition timers
  const clearTransitionTimers = useCallback(() => {
    transitionTimers.current.forEach(clearTimeout);
    transitionTimers.current = [];
  }, []);

  // Reset local view state when the project changes (prevents stale showSubMap)
  useEffect(() => {
    setShowSubMap(false);
    setTransitioning(false);
    setZoomStyle({});
    clearTransitionTimers();
  }, [project, clearTransitionTimers]);

  // Zoom-in animation: master → sub
  useEffect(() => {
    if (!isZoomingIn || !zoomTargetPin || !wrapperRef.current) return;

    // Guard: don't zoom into a pin with empty subMapId (3D-only pins)
    if (!zoomTargetPin.subMapId) {
      clearZoomAnimation();
      return;
    }

    // Cancel any in-flight transition first
    clearTransitionTimers();

    const wrapper = wrapperRef.current;
    const rect = wrapper.getBoundingClientRect();
    const pinX = zoomTargetPin.x * rect.width;
    const pinY = zoomTargetPin.y * rect.height;

    // Calculate transform origin at the pin position
    const originX = (pinX / rect.width) * 100;
    const originY = (pinY / rect.height) * 100;

    setTransitioning(true);

    // Phase 1: zoom toward pin
    setZoomStyle({
      transformOrigin: `${originX}% ${originY}%`,
      transform: 'scale(4)',
      opacity: '0',
      transition: 'transform 350ms cubic-bezier(0.4,0,0.2,1), opacity 250ms ease 150ms',
    });

    const t1 = setTimeout(() => {
      // Phase 2: switch to sub-map (invisible)
      navigateToSubMap(zoomTargetPin.subMapId);
      setShowSubMap(true);
      setZoomStyle({
        transformOrigin: 'center center',
        transform: 'scale(0.85)',
        opacity: '0',
        transition: 'none',
      });
    }, 380);

    const t2 = setTimeout(() => {
      // Phase 3: fade in sub-map
      setZoomStyle({
        transformOrigin: 'center center',
        transform: 'scale(1)',
        opacity: '1',
        transition: 'transform 300ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease',
      });
    }, 420);

    const t3 = setTimeout(() => {
      setZoomStyle({});
      setTransitioning(false);
      clearZoomAnimation();
    }, 750);

    transitionTimers.current = [t1, t2, t3];
    // No cleanup return — timers must run to completion even if isZoomingIn
    // changes mid-animation (navigateToMaster sets it to false in parallel).
    // New animations cancel old timers via clearTransitionTimers() at the top.
  }, [isZoomingIn, zoomTargetPin, navigateToSubMap, clearZoomAnimation, clearTransitionTimers]);

  // Zoom-out animation: sub → master
  useEffect(() => {
    if (!isZoomingOut) return;

    // Cancel any in-flight transition first
    clearTransitionTimers();
    setTransitioning(true);

    // Phase 1: shrink + fade out
    setZoomStyle({
      transform: 'scale(0.8)',
      opacity: '0',
      transition: 'transform 280ms ease-in, opacity 200ms ease',
    });

    const t1 = setTimeout(() => {
      navigateToMaster();
      setShowSubMap(false);
      setZoomStyle({
        transform: 'scale(1.1)',
        opacity: '0',
        transition: 'none',
      });
    }, 290);

    const t2 = setTimeout(() => {
      setZoomStyle({
        transform: 'scale(1)',
        opacity: '1',
        transition: 'transform 280ms ease-out, opacity 200ms ease',
      });
    }, 330);

    const t3 = setTimeout(() => {
      setZoomStyle({});
      setTransitioning(false);
      clearZoomAnimation();
    }, 640);

    transitionTimers.current = [t1, t2, t3];
    // No cleanup return — same reasoning as zoom-in above.
  }, [isZoomingOut, navigateToMaster, clearZoomAnimation, clearTransitionTimers]);

  // Cleanup all pending timers on unmount only
  useEffect(() => () => clearTransitionTimers(), [clearTransitionTimers]);

  // When navigating to master outside of an animation (e.g. RescuePanel click),
  // sync the local showSubMap state so MasterMapView renders correctly
  useEffect(() => {
    if (viewLevel === 'master' && !transitioning) {
      setShowSubMap(false);
    }
  }, [viewLevel, transitioning]);

  const activeSubMap = getActiveSubMap();
  const activeFloor = getActiveFloor();
  const displaySubMap = viewLevel === 'submap' || showSubMap;

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full relative overflow-hidden bg-[#0a0d14]"
      style={zoomStyle}
    >
      {!displaySubMap ? (
        <MasterMapView project={project} on3DPinClick={on3DPinClick} />
      ) : (
        activeSubMap && activeFloor ? (
          <SubMapView
            subMap={activeSubMap}
            floor={activeFloor}
            on3DPinClick={on3DPinClick}
            isSetupMode={isSetupMode}
            simPosition={simPosition}
            simPlaying={simPlaying}
          />
        ) : (
          <MasterMapView project={project} on3DPinClick={on3DPinClick} />
        )
      )}

      {/* Transitioning overlay */}
      {transitioning && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }} />
      )}
    </div>
  );
}
