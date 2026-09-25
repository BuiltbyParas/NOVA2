import { useEffect } from 'react';
import { useSpatialStore } from '../../state/spatialStore';
import { inputRouter } from '../../systems/input/inputRouter';
import { createHandInputSource } from '../../systems/input/handInputSource';
import { handTracker } from '../../vision/handTracker';
import { WORKSPACE_ORDER } from '../../data/workspaces';
import { dispatch } from '../../systems/command/commandBus';

/**
 * Manages the lifecycle of webcam hand input.
 *
 * When Vision Mode is active, starts the local hand tracker and registers
 * the hand input source with the central input router.
 * When inactive, cleanly stops the camera and unregisters the source.
 */
export function HandInputDriver() {
  const visionActive = useSpatialStore((state) => state.visionActive);
  const setVisionStatus = useSpatialStore((state) => state.setVisionStatus);
  const notify = useSpatialStore((state) => state.notify);

  useEffect(() => {
    if (!visionActive) {
      handTracker.stop();
      /**
       * A failure must survive the teardown it causes.
       *
       * `setVisionStatus('error', …)` also clears `visionActive`, which re-runs
       * this effect — and resetting to `off` here overwrote the reason before
       * anybody could read it. A refused camera then reported itself as simply
       * switched off, which is the difference between "you have not turned this
       * on" and "your browser said no".
       */
      if (useSpatialStore.getState().visionStatus !== 'error') setVisionStatus('off');
      return;
    }

    const handSource = createHandInputSource();
    inputRouter.register(handSource);
    setVisionStatus('starting');

    let mounted = true;

    handTracker
      .start()
      .then(() => {
        if (!mounted) return;
        setVisionStatus('active');
        notify('Hand tracking on', 'success');
      })
      .catch((err) => {
        if (!mounted) return;
        // The camera is a device like any other: refused, missing or busy are
        // all survivable, and NOVA carries on with the mouse and the voice.
        // There is deliberately no retry — a denied permission does not become
        // granted by asking again in a loop.
        const msg = err instanceof Error ? err.message : 'The camera could not be started';
        setVisionStatus('error', msg);
        notify(`Camera · ${msg}`, 'error');
      });

    const unsubSwipe = handTracker.onFrame((frame) => {
      if (!frame || !frame.swipeDirection) return;
      const state = useSpatialStore.getState();
      const current = WORKSPACE_ORDER.indexOf(state.workspace);
      // Swiping left moves to next workspace; swiping right moves to previous workspace
      const step = frame.swipeDirection === 'left' ? 1 : -1;
      // The recogniser owns the swipe cooldown, so this fires once per swipe.
      const next = WORKSPACE_ORDER[(current + step + WORKSPACE_ORDER.length) % WORKSPACE_ORDER.length];
      dispatch({ action: 'workspace', target: next }, 'gesture');
    });

    return () => {
      mounted = false;
      unsubSwipe();
      inputRouter.unregister(handSource.id);
      handTracker.stop();
    };
  }, [visionActive, setVisionStatus, notify]);

  return null;
}
