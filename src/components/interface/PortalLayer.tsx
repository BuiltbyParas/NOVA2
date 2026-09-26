import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppType } from '../../types/window';
import type { CommandSource } from '../../types/command';
import { APPS } from '../../data/apps';
import { useSpatialStore } from '../../state/spatialStore';
import { cursor, interaction } from '../../systems/interaction/interactionSystem';
import { PORTAL_CLAIM, requestPortal, selectPortalApp } from '../../systems/portal/portal';
import { portalApps } from '../../systems/portal/portalModel';
import { portalScreen } from '../../systems/portal/portalScreen';
import { APP_ICONS } from './appIcons';

/**
 * The NOVA portal's applications, as controls (Phase 12).
 *
 * `PortalDriver` flies each application out of the Core in the scene and
 * projects it onto the screen; this draws what it projected as real buttons —
 * crisp, readable, focusable — so the reveal is spatial and still usable by
 * mouse, keyboard and hand alike.
 *
 * It decides nothing. Choosing an application calls `selectPortalApp`, which
 * closes the portal and sends "open <name>" to `routeUtterance`; dismissing
 * calls `requestPortal(false)`. There is no launcher here, no store mutation,
 * and no list of its own: the applications are `portalApps()`.
 *
 * Positions are written straight to the DOM once per animation frame through
 * refs, the way the spatial cursor and the Core caption follow the scene;
 * React re-renders only when the portal opens or closes, or the highlight moves.
 */

/** Two air clicks inside this window count as one (as on the Command Deck). */
const SELECT_COOLDOWN_MS = 600;
/** How close, in px, a hand's cursor must be to an application to highlight it. */
const HAND_REACH_PX = 78;
/** An application can be chosen once it is this far out of the Core. */
const SELECTABLE_TRAVEL = 0.35;

export function PortalLayer() {
  const intentOpen = useSpatialStore((state) => state.portal.open);
  const openedAt = useSpatialStore((state) => state.portal.at);
  const apps = portalApps();
  const [shown, setShown] = useState(false);
  // A highlight belongs to the opening it was made in, so every bloom starts fresh.
  const [highlight, setHighlight] = useState<{ app: AppType; at: number } | null>(null);
  const highlighted = intentOpen && highlight && highlight.at === openedAt ? highlight.app : null;
  const openedAtRef = useRef(openedAt);
  const setHighlighted = useCallback((app: AppType | null) => {
    setHighlight(app ? { app, at: openedAtRef.current } : null);
  }, []);

  const itemRefs = useRef(new Map<AppType, HTMLButtonElement>());
  const trailRefs = useRef(new Map<AppType, HTMLSpanElement>());
  const glowRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<AppType | null>(null);
  const lastSelectRef = useRef(0);

  useEffect(() => {
    highlightRef.current = highlighted;
    openedAtRef.current = openedAt;
  }, [highlighted, openedAt]);

  const choose = useCallback((app: AppType, source: CommandSource) => {
    const now = performance.now();
    if (now - lastSelectRef.current < SELECT_COOLDOWN_MS) return;
    lastSelectRef.current = now;
    setHighlighted(null);
    selectPortalApp(app, source);
  }, [setHighlighted]);

  // The motion: one transform per element per frame, straight from the projection.
  useEffect(() => {
    let frame = 0;
    let wasShown = false;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const visible = portalScreen.phase !== 'closed';
      if (visible !== wasShown) {
        wasShown = visible;
        setShown(visible);
      }

      const glow = glowRef.current;
      if (glow) {
        const charge = portalScreen.charge;
        glow.style.transform = `translate3d(${portalScreen.originX}px, ${portalScreen.originY}px, 0) scale(${0.5 + charge * 0.6})`;
        glow.style.opacity = String(visible ? charge * 0.55 : 0);
      }

      let nearest: AppType | null = null;
      let nearestDistance = HAND_REACH_PX;
      apps.forEach((app, index) => {
        const element = itemRefs.current.get(app);
        const trail = trailRefs.current.get(app);
        const item = portalScreen.items[index];
        if (!element) return;
        if (!visible || index >= portalScreen.count) {
          element.style.opacity = '0';
          if (trail) trail.style.opacity = '0';
          return;
        }
        element.style.transform = `translate3d(${item.x}px, ${item.y}px, 0) translate(-50%, -50%) scale(${item.scale})`;
        element.style.opacity = String(item.opacity);
        element.style.zIndex = String(1000 - Math.round(item.depth * 10));
        element.style.pointerEvents = item.travel > SELECTABLE_TRAVEL ? 'auto' : 'none';

        // A thread of light from the Core, while the application is in flight.
        if (trail) {
          const dx = item.x - portalScreen.originX;
          const dy = item.y - portalScreen.originY;
          const length = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);
          const alive = Math.sin(Math.PI * Math.min(1, item.travel)) * item.opacity;
          trail.style.transform = `translate3d(${portalScreen.originX}px, ${portalScreen.originY}px, 0) rotate(${angle}rad) scaleX(${length})`;
          trail.style.opacity = String(alive * 0.8);
        }

        // A hand's cursor highlights the application it is nearest to.
        if (cursor.visible && item.travel > SELECTABLE_TRAVEL) {
          const distance = Math.hypot(cursor.x - item.x, cursor.y - item.y);
          if (distance < nearestDistance * Math.max(0.6, item.scale)) {
            nearest = app;
            nearestDistance = distance;
          }
        }
      });
      if (visible && cursor.visible && nearest !== highlightRef.current) {
        highlightRef.current = nearest;
        setHighlighted(nearest);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [apps, setHighlighted]);

  // While the portal is open it owns a hand's activation — as the Command Deck
  // does — so one air click is one choice: the highlighted application, or,
  // pointing at nothing, folding the portal away.
  useEffect(() => {
    if (!intentOpen) return;
    return interaction.claimActivation(() => {
      const app = highlightRef.current;
      if (app) choose(app, 'gesture');
      else requestPortal(false, 'gesture', PORTAL_CLAIM);
    }, PORTAL_CLAIM);
  }, [intentOpen, choose]);

  // The keyboard, while open: arrows move between applications, Enter or Space
  // opens one, Escape folds the portal away. Captured, so nothing else acts on them.
  useEffect(() => {
    if (!intentOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const current = highlightRef.current ? apps.indexOf(highlightRef.current) : -1;
      const move = (step: number) => {
        event.preventDefault();
        event.stopPropagation();
        const next = apps[(current + step + apps.length) % apps.length];
        highlightRef.current = next;
        setHighlighted(next);
        itemRefs.current.get(next)?.focus({ preventScroll: true });
      };
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          move(1);
          return;
        case 'ArrowLeft':
        case 'ArrowUp':
          // From no highlight, Left lands on the last application.
          move(current < 0 ? 0 : -1);
          return;
        case 'Enter':
        case ' ':
          event.preventDefault();
          event.stopPropagation();
          if (highlightRef.current) choose(highlightRef.current, 'keyboard');
          else requestPortal(false, 'keyboard', PORTAL_CLAIM);
          return;
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          requestPortal(false, 'keyboard', PORTAL_CLAIM);
          return;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [intentOpen, apps, choose, setHighlighted]);

  return (
    <div className="portal" data-open={intentOpen} data-shown={shown}>
      <div className="portal__glow" ref={glowRef} aria-hidden />
      {apps.map((app) => (
        <span
          key={`trail-${app}`}
          className="portal__trail"
          aria-hidden
          ref={(element) => {
            if (element) trailRefs.current.set(app, element);
            else trailRefs.current.delete(app);
          }}
        />
      ))}
      <nav className="portal__apps" aria-label="NOVA applications" aria-hidden={!intentOpen} inert={!intentOpen}>
        {apps.map((app) => {
          const Icon = APP_ICONS[app];
          return (
            <button
              key={app}
              type="button"
              className="portal__item"
              data-highlighted={highlighted === app}
              aria-label={`Open ${APPS[app].name}`}
              tabIndex={intentOpen ? 0 : -1}
              ref={(element) => {
                if (element) itemRefs.current.set(app, element);
                else itemRefs.current.delete(app);
              }}
              onClick={() => choose(app, 'pointer')}
              onPointerEnter={() => setHighlighted(app)}
              onPointerLeave={() => {
                if (highlightRef.current === app) setHighlighted(null);
              }}
              style={{ ['--app-tint' as string]: APPS[app].tint }}
            >
              <span className="portal__icon">
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <span className="portal__name">{APPS[app].name}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
