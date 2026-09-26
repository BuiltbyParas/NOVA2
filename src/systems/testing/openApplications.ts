import type { AppType } from '../../types/window';
import { APP_ORDER } from '../../data/apps';
import { dispatch } from '../command/commandBus';

/**
 * Test fixture (Phase 12): open NOVA's applications the way a person would.
 *
 * Until Phase 12 NOVA started with all five spatial windows placed; now it
 * starts with none, and applications come out of the portal. Suites that
 * exercise windows establish that arrangement themselves — through the command
 * bus, with ordinary `open` commands, never by writing windows into the store —
 * and then clear focus, which is how the old startup state began.
 */
export function openApplications(apps: readonly AppType[] = APP_ORDER): void {
  for (const app of apps) dispatch({ action: 'open', target: app }, 'system');
  dispatch({ action: 'blur' }, 'system');
}
