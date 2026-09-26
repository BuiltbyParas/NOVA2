import { useEffect, useRef, useState } from 'react';
import { useSpatialStore } from '../../state/spatialStore';
import { WORKSPACES } from '../../data/workspaces';
import { CORE_MODE_LABEL, type CoreMode } from '../../systems/environment/ambience';
import { spatialCoreScreen } from '../spatial/spatialCoreState';

/**
 * The NOVA Spatial Core's caption (Phase 11B).
 *
 * Two lines of very small text attached beside the Core by a short leader line,
 * following it as the viewpoint moves: what NOVA is doing, and where you are.
 * A heads-up annotation, not a panel — no box, no card, lowest in the visual
 * hierarchy.
 *
 * Position follows the Core through a requestAnimationFrame loop that writes
 * one transform, like the spatial cursor; the text re-renders only when the
 * mode or the workspace actually changes.
 */
export function SpatialCoreLabel() {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<CoreMode>('idle');
  const workspace = useSpatialStore((state) => state.workspace);
  const surfaces = useSpatialStore((state) =>
    Object.values(state.windows).filter((win) => !win.minimized && win.lifecycle !== 'closing').length,
  );

  useEffect(() => {
    let frame = 0;
    let last = '';
    let lastMode: CoreMode = 'idle';
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const element = ref.current;
      if (!element) return;
      // Below and to the right of the rings, where the working volume leaves room.
      const x = Math.round(spatialCoreScreen.x + spatialCoreScreen.radius * 0.6);
      const y = Math.round(spatialCoreScreen.y + spatialCoreScreen.radius * 0.4);
      const next = spatialCoreScreen.visible ? `translate3d(${x}px, ${y}px, 0)` : 'translate3d(-9999px, 0, 0)';
      if (next !== last) {
        element.style.transform = next;
        last = next;
      }
      if (spatialCoreScreen.mode !== lastMode) {
        lastMode = spatialCoreScreen.mode;
        setMode(lastMode);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="core-label" ref={ref} data-mode={mode} aria-live="polite">
      <div className="core-label__body">
        <span className="core-label__state">
          <span className="core-label__dot" />
          NOVA · {CORE_MODE_LABEL[mode]}
        </span>
        <span className="core-label__context">
          {WORKSPACES[workspace].name} · {surfaces} {surfaces === 1 ? 'surface' : 'surfaces'}
        </span>
      </div>
    </div>
  );
}
