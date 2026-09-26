import type { AppType } from '../../types/window';
import { APP_ORDER } from '../../data/apps';
import { dispatch } from '../command/commandBus';
import { useSpatialStore } from '../../state/spatialStore';

/**
 * Test fixture (Phase 12): open NOVA's applications the way a person would.
 *
 * Until Phase 12 NOVA started with all five spatial windows placed; now it
 * starts with none, and applications come out of the portal. Suites that
 * exercise windows establish that arrangement themselves — through the command
 * bus, with ordinary `open` commands, never by writing windows into the store —
 * and then clear focus, which is how the old startup state began.
 *
 * Since Phase 13, opening an application also moves to its layer. The fixture
 * lets that transition finish — the step `LayerTransitionGovernor` performs in
 * the frame loop as time passes — and returns to the first layer, so every
 * suite starts where NOVA used to start: all five open, on layer one, idle.
 */
export function openApplications(apps: readonly AppType[] = APP_ORDER): void {
  for (const app of apps) dispatch({ action: 'open', target: app }, 'system');
  finishLayerTransition();
  if (useSpatialStore.getState().layer.currentLayerIndex !== 0) {
    dispatch({ action: 'layer-go', target: 0 }, 'system');
    finishLayerTransition();
  }
  dispatch({ action: 'blur' }, 'system');
}

/** Complete a running layer transition, as the frame loop does when it ends. */
function finishLayerTransition(): void {
  const store = useSpatialStore.getState();
  if (store.layer.phase !== 'idle') store.completeLayerTransition();
}
