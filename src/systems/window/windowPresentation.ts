import type { SpatialWindow } from '../../types/window';
import type { SpatialPosition } from '../../types/spatial';
import { DOCK_TILE, dockSlot } from '../workspace/layoutEngine';
import { easeOutQuint, smoothstep } from '../../utils/math';
import { CLOSE_TRANSITION_MS } from '../command/commandBus';

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
  const { now, dockOrder, corePosition } = context;

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

  if (win.lifecycle === 'entering') {
    const progress = easeOutQuint((now - win.lifecycleAt) / ENTRY_TRANSITION_MS);
    opacity = Math.min(1, progress * 1.6);
    if (win.origin) {
      // Phase 12: out of the NOVA Core — from a compressed point at its heart,
      // along a path that swings slightly towards the viewer, to its place.
      const o = win.origin;
      const lift = Math.sin(progress * Math.PI) * 0.5;
      position = {
        x: o.x + (position.x - o.x) * progress,
        y: o.y + (position.y - o.y) * progress,
        z: o.z + (position.z - o.z) * progress + lift,
      };
      scale *= 0.08 + 0.92 * progress;
    } else {
      // Windows establish themselves by settling forward out of the depth.
      position = { ...position, z: position.z - (1 - progress) * 0.9 };
      scale *= 0.93 + 0.07 * progress;
    }
  } else if (win.lifecycle === 'closing') {
    const raw = (now - win.lifecycleAt) / CLOSE_TRANSITION_MS;
    const progress = smoothstep(raw);
    opacity = 1 - progress;
    // Closing recedes into the environment rather than fading on the spot.
    position = { ...position, z: position.z - progress * 0.8, y: position.y - progress * 0.12 };
    scale *= 1 - 0.14 * progress;
    expired = raw >= 1;
  }

  return { position, rotation, scale, opacity, collapsed: win.minimized, expired };
}

/** Ids of every minimized window, ordered as they appear in the dock. */
export function dockOrderOf(order: string[], windows: Record<string, SpatialWindow>) {
  return order.filter((id) => windows[id]?.minimized);
}
