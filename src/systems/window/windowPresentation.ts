import type { SpatialWindow } from '../../types/window';
import type { SpatialPosition } from '../../types/spatial';
import { DOCK_TILE, dockSlot } from '../workspace/layoutEngine';
import { easeOutQuint, smoothstep } from '../../utils/math';
import { CLOSE_TRANSITION_MS } from '../command/commandBus';
import type { LayerState } from '../../types/layer';
import { layerForApp } from '../../data/layers';

export const ENTRY_TRANSITION_MS = 780;

/** How far a focused window steps toward the viewer, and how much it grows. */
const FOCUS_LIFT = 0.3;
const FOCUS_GAIN = 1.04;

/** Subtle elevation and scale when targeted by the spatial pointer/hand. */
const HOVER_LIFT = 0.09;
const HOVER_GAIN = 1.015;

export interface WindowPresentation {
  position: SpatialPosition;
  rotation: { x: number; y: number; z: number };
  scale: number;
  opacity: number;
  /** 1 when the window should read as a collapsed slab in the dock. */
  collapsed: boolean;
  /** True once a closing transition has finished playing. */
  expired: boolean;
}

interface PresentationContext {
  /** Ids of minimized windows, in dock order. */
  dockOrder: string[];
  corePosition: SpatialPosition;
  now: number;
  hoveredId?: string | null;
  /** Phase 13: Centralized spatial application layer state */
  layerState?: LayerState;
}

/**
 * Derives what a window should *look* like from what it *is*.
 *
 * Focus lift, entry and closing transitions live here rather than in the store:
 * they are presentation, and keeping them out of state means a gesture or the AI
 * reading `position` always sees the window's real place in the environment.
 */
export function presentWindow(
  win: SpatialWindow,
  context: PresentationContext,
): WindowPresentation {
  const { now, dockOrder, corePosition, layerState } = context;

  let position: SpatialPosition;
  let rotation = { ...win.rotation };
  let scale: number;

  if (win.minimized) {
    const index = Math.max(0, dockOrder.indexOf(win.id));
    position = dockSlot(index, corePosition);
    // Collapsed windows square up to the viewer so the dock reads as one row.
    rotation = { x: 0, y: 0, z: 0 };
    scale = DOCK_TILE.width / win.width;
  } else {
    position = { ...win.position };
    scale = win.scale;
    if (win.focused) {
      position = { ...position, z: position.z + FOCUS_LIFT };
      scale *= FOCUS_GAIN;
    } else if (context.hoveredId === win.id) {
      position = { ...position, z: position.z + HOVER_LIFT };
      scale *= HOVER_GAIN;
    }
  }

  let opacity = 1;
  let expired = false;

  // --- Phase 13: Spatial Application Layers Hierarchy & Transition ---
  if (layerState && !win.minimized) {
    const winLayerIdx = layerForApp(win.app);
    const { currentLayerIndex, targetLayerIndex, phase, progress, direction } = layerState;

    if (phase === 'idle') {
      // Static hierarchy: Active layer in Foreground; other layers in Midground / Background
      const layerDist = winLayerIdx - currentLayerIndex;
      if (layerDist !== 0) {
        const absDist = Math.abs(layerDist);
        // Midground / Background depth push:
        // Other layers rest deeper in space (z - 2.8 per layer), scaled down, subtly shifted horizontally
        const sideSign = layerDist > 0 ? 1 : -1;
        position = {
          x: position.x + sideSign * (absDist * 1.8),
          y: position.y - absDist * 0.15,
          z: position.z - absDist * 3.2,
        };
        scale *= Math.max(0.45, 1 - absDist * 0.28);
        opacity *= Math.max(0.12, 1 - absDist * 0.58);
        // Gentle inward turn for background layers
        rotation = {
          ...rotation,
          y: rotation.y - sideSign * Math.min(0.25, absDist * 0.15),
        };
      }
    } else {
      // Dynamic Spatial Transition: Physical movement through space
      // Dir sign: 'next' (swiped left) means current layer exits to the left (-X) and deep (+Z delta negative)
      // while next layer sweeps in from the right (+X) and front (+Z delta positive)
      const dirSign = direction === 'next' ? -1 : 1;
      const t = smoothstep(progress);

      if (winLayerIdx === currentLayerIndex) {
        // Outgoing layer: sweeps outward and recedes into deep space
        position = {
          x: position.x + dirSign * (t * 5.4),
          y: position.y - t * 0.25,
          z: position.z - t * 3.2,
        };
        scale *= 1 - t * 0.28;
        opacity *= 1 - t * 0.72;
      } else if (winLayerIdx === targetLayerIndex) {
        // Incoming layer: approaches from deep space and enters the focused foreground
        const enterT = 1 - t;
        position = {
          x: position.x - dirSign * (enterT * 5.4),
          y: position.y - enterT * 0.25,
          z: position.z - enterT * 3.2,
        };
        scale *= 1 - enterT * 0.28;
        opacity *= 1 - enterT * 0.72;
      } else {
        // Non-participating background layer
        const targetDist = Math.abs(winLayerIdx - targetLayerIndex);
        position = {
          ...position,
          z: position.z - targetDist * 3.2,
        };
        scale *= 0.5;
        opacity *= 0.15;
      }
    }
  }

  if (win.lifecycle === 'entering') {
    const enterProgress = easeOutQuint((now - win.lifecycleAt) / ENTRY_TRANSITION_MS);
    opacity *= enterProgress;
    // Windows establish themselves by settling forward out of the depth.
    position = { ...position, z: position.z - (1 - enterProgress) * 0.9 };
    scale *= 0.93 + 0.07 * enterProgress;
  } else if (win.lifecycle === 'closing') {
    const raw = (now - win.lifecycleAt) / CLOSE_TRANSITION_MS;
    const closeProgress = smoothstep(raw);
    opacity *= 1 - closeProgress;
    // Closing recedes into the environment rather than fading on the spot.
    position = { ...position, z: position.z - closeProgress * 0.8, y: position.y - closeProgress * 0.12 };
    scale *= 1 - 0.14 * closeProgress;
    expired = raw >= 1;
  }

  return { position, rotation, scale, opacity, collapsed: win.minimized, expired };
}

/** Ids of every minimized window, ordered as they appear in the dock. */
export function dockOrderOf(order: string[], windows: Record<string, SpatialWindow>) {
  return order.filter((id) => windows[id]?.minimized);
}
