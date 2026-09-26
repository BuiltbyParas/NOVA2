import { Vector3 } from 'three';
import { ENVIRONMENT } from '../../data/environment';
import type { CoreMode } from '../../systems/environment/ambience';

/**
 * Shared facts about the NOVA Spatial Core (Phase 11B).
 *
 * Kept apart from the component so the renderer, the room's shaders and the
 * on-screen caption can all read them — and so the component file exports only
 * a component, which keeps hot reloading intact.
 */

/** Where the Core's centre sits in the world. */
export const SPATIAL_CORE_POSITION = new Vector3(
  ENVIRONMENT.stage.x,
  ENVIRONMENT.spatialCore.y,
  ENVIRONMENT.stage.z,
);

/**
 * Where the Core appears on screen, written each frame by the Core for the DOM
 * caption. A plain mutable object like `cursor`, so following it costs no React
 * renders.
 */
export const spatialCoreScreen = { x: 0, y: 0, radius: 0, visible: false, mode: 'idle' as CoreMode };

/**
 * The bloom's light, written each frame by the Core for the room (Phase 11D):
 * how strongly its tips are flaring, 0..1, so the flare can send a wave of
 * light into the space around it.
 */
export const spatialCoreLight = { flare: 0 };
