import { useFrame } from '@react-three/fiber';
import { spatial, useSpatialStore } from '../../state/spatialStore';

const TRANSITION_DURATION_MS = 620;

/**
 * Progresses and completes the spatial layer transition in the 3D frame loop.
 *
 * Runs once per frame, calculating smooth progress from 0 to 1 without React re-renders.
 * Once progress reaches 1.0, calls completeLayerTransition() to settle the state back to idle.
 */
export function LayerTransitionGovernor() {
  useFrame((_, delta) => {
    const store = spatial();
    const { phase, transitionStartedAt, progress } = store.layer;

    if (phase === 'transitioning') {
      const now = performance.now();
      const elapsed = now - transitionStartedAt;
      const targetProgress = Math.min(1, elapsed / TRANSITION_DURATION_MS);

      // Smooth progress update
      const nextProgress = Math.min(1, progress + (targetProgress - progress) * Math.min(1, delta * 24));

      if (targetProgress >= 1 || Math.abs(1 - nextProgress) < 0.005) {
        useSpatialStore.getState().completeLayerTransition();
      } else {
        useSpatialStore.getState().setLayerProgress(nextProgress);
      }
    }
  });

  return null;
}
