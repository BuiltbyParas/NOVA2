import type { InputSource, PointerFrame } from './types';
import type { InputModality } from '../../types/multimodal';

/**
 * Fans any number of input sources into a single spatial pointer stream.
 *
 * Phase 1 registers one source (mouse). Later, a hand tracker and a mouse can be
 * registered at once — whichever reports the higher confidence most recently wins,
 * so the user can drop their hands and grab the trackpad mid-task.
 */
class InputRouter {
  private sources = new Map<string, InputSource>();
  private consumer: ((frame: PointerFrame) => void) | null = null;
  private lastSourceId: string | null = null;
  private lastConfidence = 0;
  private lastAt = 0;

  /** How long a higher-confidence source keeps priority before others may take over. */
  private static readonly HOLD_MS = 700;

  setConsumer(consumer: (frame: PointerFrame) => void) {
    this.consumer = consumer;
  }

  register(source: InputSource) {
    if (this.sources.has(source.id)) return;
    this.sources.set(source.id, source);
    source.connect((frame) => this.accept(source.id, frame));
  }

  unregister(id: string) {
    this.sources.get(id)?.disconnect();
    this.sources.delete(id);
    if (this.lastSourceId === id) this.lastSourceId = null;
  }

  private accept(id: string, frame: PointerFrame) {
    const now = performance.now();
    const holding =
      this.lastSourceId !== null &&
      this.lastSourceId !== id &&
      now - this.lastAt < InputRouter.HOLD_MS &&
      this.lastConfidence >= frame.confidence;

    if (holding) return;

    this.lastSourceId = id;
    this.lastConfidence = frame.confidence;
    this.lastAt = now;
    this.consumer?.(frame);
  }

  /**
   * Which device most recently drove the pointer.
   *
   * The router has always tracked this to arbitrate between sources; Phase 7
   * only exposes it, so a hover can be attributed to the hand or the mouse
   * without anything else having to guess.
   */
  activeModality(): InputModality | null {
    if (this.lastSourceId === 'mouse') return 'mouse';
    if (this.lastSourceId === 'hand') return 'hand';
    return null;
  }

  dispose() {
    for (const source of this.sources.values()) source.disconnect();
    this.sources.clear();
    this.consumer = null;
  }
}

export const inputRouter = new InputRouter();
