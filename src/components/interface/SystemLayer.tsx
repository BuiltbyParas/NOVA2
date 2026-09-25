import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSpatialStore } from '../../state/spatialStore';
import type { NoticeKind } from '../../state/spatialStore';
import { dispatch, subscribeToCommands } from '../../systems/command/commandBus';
import { StatusHUD } from './StatusHUD';
import { CommandDeck } from './CommandDeck';
import { VoicePanel } from './VoicePanel';

const HINTS = [
  ['drag', 'move a surface'],
  ['corner', 'resize'],
  ['alt + drag', 'rotate'],
  ['scroll', 'depth'],
  ['1 – 5', 'focus'],
  ['V', 'vision mode'],
  ['S', 'speak'],
  ['P', 'presentation'],
  ['⌘K', 'command line'],
];

/**
 * NOVA answering.
 *
 * Every instruction gets one, whichever way it arrived — typed, spoken, pinched
 * or pointed at — because the acknowledgement belongs to the command, not to
 * the device that produced it. The card names NOVA once and then says what
 * happened in one line, which is the whole of the feature: a system that
 * answers reads as a system that understood.
 */
function Notice() {
  const notice = useSpatialStore((state) => state.notice);
  const [visible, setVisible] = useState<{ text: string; kind: NoticeKind; at: number } | null>(
    null,
  );

  useEffect(() => {
    if (!notice) return;
    setVisible(notice);
    // A promise ("Opening Spotify…") stays up longer, because the result that
    // replaces it has to travel to the real computer and back.
    const life = notice.kind === 'working' ? 4200 : 2600;
    const id = window.setTimeout(() => setVisible(null), life);
    return () => window.clearTimeout(id);
  }, [notice]);

  return (
    <AnimatePresence>
      {visible && (
        <div className="notice-anchor">
          <motion.div
            className="notice"
            data-kind={visible.kind}
            key={visible.at}
            initial={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -5, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: [0.22, 0.9, 0.24, 1] }}
          >
            <span className="notice__mark">NOVA</span>
            <span className="notice__text">{visible.text}</span>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * Key hints.
 *
 * These are onboarding, not chrome. They occupy a fixed screen corner while
 * windows move freely in 3D, so a permanent overlay there would eventually sit
 * on top of a surface. Rather than chase positions, the hints retire: the first
 * command the user issues is proof they have been read, and they fade for good.
 * Presentation mode retires them immediately — an audience is not learning the
 * keyboard.
 */
function Hints() {
  const [retired, setRetired] = useState(false);
  const presenting = useSpatialStore((state) => state.presentation);

  useEffect(
    () =>
      subscribeToCommands(({ source }) => {
        // 'system' covers NOVA's own startup arrangement, which teaches nothing.
        if (source !== 'system') setRetired(true);
      }),
    [],
  );

  return (
    <AnimatePresence>
      {!retired && !presenting && (
        <motion.div
          className="hints"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 0.9, 0.24, 1] }}
        >
          {HINTS.map(([key, meaning]) => (
            <span className="hints__row" key={key}>
              <span className="hints__key">{key}</span>
              <span className="hints__meaning">{meaning}</span>
            </span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The product signature. One word, and the state of the thing it names. */
function Identity() {
  const coreState = useSpatialStore((state) => state.core.state);
  const presenting = useSpatialStore((state) => state.presentation);

  return (
    <div className="identity">
      <button
        type="button"
        className="identity__mark"
        onClick={() => dispatch({ action: 'command', open: true }, 'pointer')}
        title="Open the command line (⌘K)"
      >
        NOVA
      </button>
      <span className="identity__state" data-state={coreState}>
        {presenting ? 'presentation' : 'spatial shell'}
      </span>
    </div>
  );
}

export function SystemLayer() {
  return (
    <>
      <Identity />
      <StatusHUD />
      <CommandDeck />
      <VoicePanel />
      <Notice />
      <Hints />
    </>
  );
}
