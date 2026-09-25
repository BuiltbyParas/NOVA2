import type { InputSource, PointerFrame } from './types';

/**
 * Translates a mouse or trackpad into spatial pointer frames.
 *
 * Phase 1's only input source. It is intentionally thin: it converts device
 * events into normalised coordinates and nothing else. No window is moved here.
 */
export function createMouseInputSource(element: HTMLElement): InputSource {
  let emit: ((frame: PointerFrame) => void) | null = null;

  const frame: PointerFrame = {
    x: 0,
    y: 0,
    primary: false,
    present: false,
    depthDelta: 0,
    modifiers: { shift: false, alt: false, meta: false },
    confidence: 1,
  };

  const publish = () => emit?.({ ...frame, modifiers: { ...frame.modifiers } });

  const readModifiers = (event: MouseEvent | WheelEvent | KeyboardEvent) => {
    frame.modifiers.shift = event.shiftKey;
    frame.modifiers.alt = event.altKey;
    frame.modifiers.meta = event.metaKey || event.ctrlKey;
  };

  const onPointerMove = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    frame.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    frame.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    frame.present = true;
    readModifiers(event);
    publish();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    frame.primary = true;
    readModifiers(event);
    element.setPointerCapture?.(event.pointerId);
    publish();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    frame.primary = false;
    readModifiers(event);
    element.releasePointerCapture?.(event.pointerId);
    publish();
  };

  const onPointerLeave = () => {
    frame.present = false;
    frame.primary = false;
    publish();
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    // Normalised so a trackpad and a notched wheel feel comparable.
    frame.depthDelta = -event.deltaY * 0.0022;
    readModifiers(event);
    publish();
    frame.depthDelta = 0;
  };

  const onModifierChange = (event: KeyboardEvent) => {
    readModifiers(event);
    publish();
  };

  return {
    id: 'mouse',
    connect(next) {
      emit = next;
      element.addEventListener('pointermove', onPointerMove);
      element.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointerup', onPointerUp);
      element.addEventListener('pointerleave', onPointerLeave);
      element.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('keydown', onModifierChange);
      window.addEventListener('keyup', onModifierChange);
    },
    disconnect() {
      emit = null;
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onModifierChange);
      window.removeEventListener('keyup', onModifierChange);
    },
  };
}
