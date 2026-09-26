import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cancelDemo, DEMO_BEATS, startDemo, useDemoStore } from '../../systems/demo/demo';

/**
 * The "Explore NOVA" trigger and the demo's caption line.
 *
 * The trigger starts the showcase, and pressed again stops it. While it runs,
 * one line at the top of the room says what NOVA is doing — for a judge who
 * has never seen it — with a progress hairline and how to leave. Escape stops
 * it at any moment and everything is put back.
 */
export function DemoLayer() {
  const running = useDemoStore((state) => state.running);
  const beat = useDemoStore((state) => state.beat);
  const caption = useDemoStore((state) => state.caption);

  // The caption stands in for NOVA's notices while the demo plays (see CSS).
  useEffect(() => {
    if (!running) return;
    document.documentElement.dataset.demo = '';
    return () => {
      delete document.documentElement.dataset.demo;
    };
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancelDemo();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [running]);

  return (
    <>
      <button
        type="button"
        className="demo-trigger"
        data-running={running || undefined}
        aria-pressed={running}
        onClick={() => (running ? cancelDemo() : startDemo())}
        title={running ? 'Stop the demo (Esc)' : 'A 25-second tour of NOVA'}
      >
        <span className="demo-trigger__glyph" aria-hidden />
        {running ? 'Stop demo' : 'Explore NOVA'}
        {running && <kbd className="demo-trigger__key">Esc</kbd>}
      </button>

      <AnimatePresence>
        {running && caption && (
          <motion.div
            className="demo-caption"
            aria-live="polite"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4, ease: [0.22, 0.9, 0.24, 1] }}
          >
            <span className="demo-caption__step">
              {String(beat + 1).padStart(2, '0')} / {String(DEMO_BEATS.length).padStart(2, '0')}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={caption}
                className="demo-caption__text"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35, ease: [0.22, 0.9, 0.24, 1] }}
              >
                {caption}
              </motion.span>
            </AnimatePresence>
            <span
              className="demo-caption__progress"
              style={{ ['--demo-progress' as string]: (beat + 1) / DEMO_BEATS.length }}
              aria-hidden
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
