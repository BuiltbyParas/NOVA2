import { useEffect, useRef } from 'react';
import { cursor } from '../../systems/interaction/interactionSystem';
import { subscribeToCommands } from '../../systems/command/commandBus';
import { ENVIRONMENT } from '../../data/environment';
import { APPS } from '../../data/apps';
import { spatial } from '../../state/spatialStore';
import { CORE_TARGET_ID } from '../../systems/interaction/targetRegistry';
import { clamp } from '../../utils/math';

/**
 * Commands that are one decision rather than a continuous adjustment.
 *
 * `move`, `scale` and `rotate` are omitted deliberately: a drag issues one of
 * them per frame, and they describe a gesture still in progress rather than an
 * act that has been completed.
 */
const DISCRETE = new Set([
  'focus',
  'open',
  'open-application',
  'close',
  'minimize',
  'restore',
]);

const CONTROL_LABELS: Record<string, string> = {
  close: 'Close',
  minimize: 'Collapse',
  resize: 'Resize',
};

/**
 * The spatial cursor.
 *
 * NOVA's focus indicator is not the operating system's arrow. It lands on the
 * surface the ray actually meets, shrinks with distance, and reports the depth of
 * whatever it is touching. Its position comes from the interaction system, so when
 * a tracked hand replaces the mouse the cursor needs no changes at all.
 */
export function SpatialCursor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    let lastLabel = '';

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const root = rootRef.current;
      if (!root) return;

      root.style.transform = `translate3d(${cursor.x}px, ${cursor.y}px, 0)`;

      // Perspective applies to the cursor too: further away is smaller.
      const scale = clamp(6.8 / Math.max(cursor.distance, 0.001), 0.6, 1.45);
      root.style.setProperty('--cursor-scale', scale.toFixed(3));

      const { back, front } = ENVIRONMENT.depth;
      const depth = clamp((cursor.depth - back) / (front - back), 0, 1);
      root.style.setProperty('--cursor-depth', depth.toFixed(3));

      root.dataset.visible = cursor.visible ? '1' : '0';
      root.dataset.mode = cursor.mode;
      root.dataset.control = cursor.hoveredControl ?? '';
      root.dataset.kind = cursor.hoveredKind ?? '';

      let label = '';
      if (cursor.hoveredControl) {
        label = CONTROL_LABELS[cursor.hoveredControl];
      } else if (cursor.hoveredId === CORE_TARGET_ID) {
        // Phase 12: the Core is the portal to NOVA's applications.
        const out = Object.values(spatial().windows).some((win) => win.lifecycle !== 'closing');
        label = out ? 'Gather applications' : 'Applications';
      } else if (cursor.hoveredId) {
        const win = spatial().windows[cursor.hoveredId];
        label = win ? APPS[win.app].name : '';
      }

      if (label !== lastLabel) {
        lastLabel = label;
        if (labelRef.current) labelRef.current.textContent = label;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  /**
   * A short pulse where a direct interaction landed.
   *
   * Pinching at a window and clicking one are the same act through different
   * hardware, and both were previously silent — the window changed, but nothing
   * marked the point in space where the decision was made. Driven from the
   * command bus rather than from the gesture recogniser, so it acknowledges the
   * command that was actually issued rather than every gesture considered.
   */
  useEffect(
    () =>
      subscribeToCommands(({ command, source }) => {
        if (source !== 'gesture' && source !== 'pointer') return;
        // Dragging emits a `move` every frame, and every one of them is the same
        // continuous act. Only the discrete decisions are acknowledged, or the
        // ring would restart sixty times a second under a moving window.
        if (!DISCRETE.has(command.action)) return;
        const root = rootRef.current;
        if (!root) return;
        // Restarting a CSS animation needs the attribute cleared, a reflow, and
        // then the attribute set again.
        root.dataset.pulse = '0';
        void root.offsetWidth;
        root.dataset.pulse = '1';
      }),
    [],
  );

  return (
    <div className="cursor" ref={rootRef} data-visible="0">
      <span className="cursor__pulse" />
      <span className="cursor__ring" />
      <span className="cursor__reticle" />
      <span className="cursor__point" />
      <div className="cursor__readout">
        <span className="cursor__label" ref={labelRef} />
        <span className="cursor__depth">
          <span className="cursor__depth-mark" />
        </span>
      </div>
    </div>
  );
}
