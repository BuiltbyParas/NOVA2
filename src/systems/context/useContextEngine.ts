import { useEffect } from 'react';
import { startContextEngine } from './contextEngine';

/**
 * Attach the context engine to the running application.
 *
 * One subscription, mounted once at the root. It costs an integer increment per
 * command and nothing at all per frame, and it causes no React re-render — the
 * engine is deliberately outside React so that dragging a window stays as cheap
 * as it was before NOVA understood anything.
 */
export function useContextEngine() {
  useEffect(() => startContextEngine(), []);
}
