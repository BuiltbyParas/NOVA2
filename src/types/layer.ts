import type { AppType } from './window';

export type LayerId = 'home' | 'development' | 'study';

export type LayerTransitionPhase =
  | 'idle'           // No transition active
  | 'transitioning'  // Animation/interpolation in progress
  | 'settling';      // Final settle before idle

export type LayerDirection = 'next' | 'previous';

export interface SpatialLayer {
  id: LayerId;
  name: string;
  order: number;
  /** Application IDs from AppType — authoritative references to APPS catalog */
  applications: AppType[];
}

export interface LayerState {
  layers: SpatialLayer[];
  currentLayerIndex: number;
  targetLayerIndex: number;
  phase: LayerTransitionPhase;
  direction: LayerDirection | null;
  /** Normalized progress 0..1 of the current transition */
  progress: number;
  transitionStartedAt: number;
}
