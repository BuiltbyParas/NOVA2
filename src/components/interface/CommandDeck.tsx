import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppType } from '../../types/window';
import type { CommandSource } from '../../types/command';
import { APPS } from '../../data/apps';
import { APP_ICONS } from './appIcons';
import { cursor, interaction } from '../../systems/interaction/interactionSystem';
import { routeUtterance } from '../../systems/command/intentRouter';

/**
 * The Spatial Command Deck.
 *
 * An arc of NOVA's five applications, thrown up next to wherever the spatial
 * cursor happens to be. It exists because NOVA's launch path was, until now,
 * only ever spoken or typed: there was nothing to *point at*, and a system whose
 * whole claim is that several modalities converge needs somewhere that
 * convergence can be seen happening.
 *
 * What it deliberately is not: a second way to change state. The deck decides
 * nothing. Choosing an item produces the sentence "open terminal" and hands it
 * to `routeUtterance` — the identical entry point the command line uses when
 * you type, the voice pipeline uses when you speak, and `gestureCommands` uses
 * when you double pinch a window. There is no deck branch downstream, no direct
 * store mutation, and no launcher of its own. Delete this file and NOVA loses a
 * surface, not a capability.
 */

const DECK_APPS: AppType[] = ['browser', 'terminal', 'files', 'code', 'notes'];

const DECK_ICONS = APP_ICONS;

/** Radius of the arc, and the sweep it occupies, in px and degrees. */
const ARC_RADIUS = 128;
const ARC_SPREAD = 116;

/**
 * Two double pinches inside this window count as one.
 *
 * The recogniser already emits `DOUBLE_PINCH` on a single frame, so this is not
 * debouncing its output — it guards against the deck acting twice while a hand
 * is still settling out of the second pinch.
 */
const SELECT_COOLDOWN_MS = 600;

interface Anchor {
  x: number;
  y: number;
}

/** Where each item sits, relative to the anchor. Pure geometry, no state. */
function seatOf(index: number, count: number) {
  const step = count > 1 ? ARC_SPREAD / (count - 1) : 0;
  // Centred on straight up, sweeping clockwise, so the arc opens above the
  // cursor where it will not sit under the hand that summoned it.
  const degrees = -90 - ARC_SPREAD / 2 + step * index;
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.cos(radians) * ARC_RADIUS,
    y: Math.sin(radians) * ARC_RADIUS,
  };
}

export function CommandDeck() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ x: 0, y: 0 });
  const [highlighted, setHighlighted] = useState<AppType | null>(null);

  const itemRefs = useRef(new Map<AppType, HTMLButtonElement>());
  // Read in the frame loop and in the activation claim, both of which would
  // otherwise close over a stale value.
  const highlightRef = useRef<AppType | null>(null);
  const lastSelectRef = useRef(0);

  useEffect(() => {
    highlightRef.current = highlighted;
  }, [highlighted]);

  /**
   * Choose an item.
   *
   * The deck closes first and the sentence goes out second, so the panel is
   * gone by the time the window it asked for arrives. `routeUtterance` is not
   * awaited for the same reason `gestureCommands` does not await it: the result
   * reaches the user through the ordinary notice machinery, and nothing here
   * should sit waiting on it.
   */
  const select = useCallback((app: AppType, source: CommandSource) => {
    const now = performance.now();
    if (now - lastSelectRef.current < SELECT_COOLDOWN_MS) return;
    lastSelectRef.current = now;

    setOpen(false);
    setHighlighted(null);
    void routeUtterance(`open ${APPS[app].name.toLowerCase()}`, source);
  }, []);

  /** Summon the deck where the cursor already is, or dismiss it. */
  const toggle = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) return false;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // Clamped so the arc cannot open off-screen when the cursor is near an
      // edge — or, when there is no cursor yet, centred low in the view.
      const x = cursor.visible ? cursor.x : width / 2;
      const y = cursor.visible ? cursor.y : height * 0.66;
      setAnchor({
        x: Math.min(Math.max(x, ARC_RADIUS + 40), width - ARC_RADIUS - 40),
        y: Math.min(Math.max(y, ARC_RADIUS + 96), height - 80),
      });
      setHighlighted(null);
      return true;
    });
  }, []);

  /**
   * Highlighting, driven by the spatial cursor.
   *
   * The cursor is already wherever POINT put it — `handInputSource` writes the
   * index fingertip into the same object the mouse writes to, so this reads
   * one position and never learns which device produced it. Rects are measured
   * once per opening rather than per frame: the arc does not move while it is
   * up, and measuring in the loop would be a layout read sixty times a second
   * for an answer that cannot have changed.
   */
  useEffect(() => {
    if (!open) return;

    const seats = DECK_APPS.map((app) => {
      const element = itemRefs.current.get(app);
      const rect = element?.getBoundingClientRect();
      return { app, rect };
    });

    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!cursor.visible) return;

      let hit: AppType | null = null;
      for (const seat of seats) {
        const rect = seat.rect;
        if (!rect) continue;
        if (
          cursor.x >= rect.left &&
          cursor.x <= rect.right &&
          cursor.y >= rect.top &&
          cursor.y <= rect.bottom
        ) {
          hit = seat.app;
          break;
        }
      }

      if (hit !== highlightRef.current) {
        highlightRef.current = hit;
        setHighlighted(hit);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  /**
   * Selection by double pinch.
   *
   * While the deck is up it claims the hand's activation from the interaction
   * system, so a double pinch chooses the highlighted item and never also
   * reaches the window behind the deck. The claim is released as the deck
   * closes, and the double pinch goes back to meaning what it always meant.
   * Because the activation arrives through the interaction system, it already
   * carries that system's latch against repeats and its confidence floor.
   */
  useEffect(() => {
    if (!open) return;
    return interaction.claimActivation(() => {
      const app = highlightRef.current;
      if (!app) return;
      select(app, 'gesture');
    }, 'deck');
  }, [open, select]);

  /** Escape closes the deck, and nothing else about the keyboard changes. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      setHighlighted(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="deck-trigger"
        data-open={open}
        onClick={toggle}
        title="Spatial command deck"
        aria-expanded={open}
      >
        <span className="deck-trigger__ring" />
        NOVA
      </button>

      {open && (
        <div
          className="deck"
          style={{ transform: `translate3d(${anchor.x}px, ${anchor.y}px, 0)` }}
          role="menu"
          aria-label="NOVA command deck"
        >
          <span className="deck__title">NOVA Command Deck</span>

          {DECK_APPS.map((app, index) => {
            const seat = seatOf(index, DECK_APPS.length);
            const Icon = DECK_ICONS[app];
            return (
              <button
                key={app}
                type="button"
                role="menuitem"
                className="deck__item"
                data-active={highlighted === app}
                style={{
                  transform: `translate3d(${seat.x}px, ${seat.y}px, 0)`,
                  ['--tint' as string]: APPS[app].tint,
                }}
                ref={(element) => {
                  if (element) itemRefs.current.set(app, element);
                  else itemRefs.current.delete(app);
                }}
                onPointerEnter={() => setHighlighted(app)}
                onClick={() => select(app, 'pointer')}
              >
                <Icon size={16} strokeWidth={1.9} />
                <span className="deck__label">{APPS[app].name}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
