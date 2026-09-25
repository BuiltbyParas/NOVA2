import type { InputSource, PointerFrame } from './types';
import { handTracker } from '../../vision/handTracker';
import type { HandFrame } from '../../vision/visionTypes';

/**
 * Translates webcam hand tracking frames into spatial pointer frames.
 *
 * Emits the exact same PointerFrame structure as the mouse input source,
 * feeding into the inputRouter and interactionSystem without any duplicated logic.
 */
export function createHandInputSource(): InputSource {
  let emit: ((frame: PointerFrame) => void) | null = null;
  let unsubscribe: (() => void) | null = null;

  const currentFrame: PointerFrame = {
    x: 0,
    y: 0,
    primary: false,
    present: false,
    depthDelta: 0,
    modifiers: { shift: false, alt: false, meta: false },
    confidence: 0,
  };

  const handleFrame = (handFrame: HandFrame | null) => {
    if (!emit) return;

    if (!handFrame) {
      if (currentFrame.present) {
        currentFrame.present = false;
        currentFrame.primary = false;
        currentFrame.confidence = 0;
        emit({ ...currentFrame });
      }
      return;
    }

    currentFrame.x = handFrame.screenNdc.x;
    currentFrame.y = handFrame.screenNdc.y;
    currentFrame.primary = handFrame.isPinching;
    currentFrame.present = true;
    currentFrame.confidence = handFrame.confidence;
    currentFrame.depthDelta = 0;
    currentFrame.gesture = handFrame.gesture;
    currentFrame.intent = handFrame.intent;

    emit({ ...currentFrame });
  };

  return {
    id: 'hand',
    connect(next) {
      emit = next;
      unsubscribe = handTracker.onFrame(handleFrame);
    },
    disconnect() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (emit && currentFrame.present) {
        currentFrame.present = false;
        currentFrame.primary = false;
        emit({ ...currentFrame });
      }
      emit = null;
    },
  };
}
