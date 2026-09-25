import {
  DEFAULT_VISION_CONFIG,
  HAND_CONNECTIONS,
  LANDMARK,
  type GestureIntent,
  type GestureState,
  type HandFrame,
  type HandPoint,
  type VisionConfig,
} from './visionTypes';
import { Point2DSmoother } from './smoothing';

/**
 * What still counts as a tap — one half of a double pinch.
 *
 * A pinch that ends within `TAP_MAX_MS` and whose pinch point never strayed
 * more than `TAP_MAX_TRAVEL` from where it began (in the recogniser's 0..1
 * image space, after smoothing) is a tap. Exported so the interaction layer can
 * hold a hand drag back for exactly as long as a pinch might still be a tap.
 */
export const TAP_MAX_MS = 280;
export const TAP_MAX_TRAVEL = 0.045;

interface HistoryPoint {
  x: number;
  y: number;
  time: number;
}

export class GestureRecognizer {
  private config: VisionConfig = { ...DEFAULT_VISION_CONFIG };
  private smoother = new Point2DSmoother(
    this.config.smoothingMinCutoff,
    this.config.smoothingBeta,
  );

  private wasPinching = false;
  private lastGesture: GestureState = 'IDLE';
  private lastDetectedAt = 0;
  private lastKnownFrame: HandFrame | null = null;
  private graceExpired = true;

  // Double pinch tracking
  private pinchStartTime = 0;
  private pinchStartPos = { x: 0, y: 0 };
  private isPinchStationary = true;
  private lastTapEndTime = 0;
  private pendingActivation = false;

  // Swipe tracking
  private positionHistory: HistoryPoint[] = [];
  private lastSwipeAt = 0;

  // Resize mode tracking
  private resizeModeActive = false;

  constructor(config?: Partial<VisionConfig>) {
    if (config) this.updateConfig(config);
  }

  updateConfig(config: Partial<VisionConfig>) {
    this.config = { ...this.config, ...config };
    this.smoother.updateConfig(
      this.config.smoothingMinCutoff,
      this.config.smoothingBeta,
    );
  }

  getConfig(): Readonly<VisionConfig> {
    return this.config;
  }

  reset() {
    this.smoother.reset();
    this.wasPinching = false;
    this.lastGesture = 'IDLE';
    this.lastDetectedAt = 0;
    this.lastKnownFrame = null;
    this.graceExpired = true;
    this.pinchStartTime = 0;
    this.pinchStartPos = { x: 0, y: 0 };
    this.isPinchStationary = true;
    this.lastTapEndTime = 0;
    this.pendingActivation = false;
    this.positionHistory = [];
    this.lastSwipeAt = 0;
    this.resizeModeActive = false;
  }

  /**
   * Process a set of landmarks for the current frame.
   * Returns a complete HandFrame, or null if idle/lost beyond grace period.
   */
  process(
    rawLandmarks: HandPoint[] | null,
    confidence: number,
    timestamp: number,
  ): HandFrame | null {
    if (!rawLandmarks || rawLandmarks.length < 21) {
      return this.handleHandLoss(timestamp);
    }

    this.lastDetectedAt = timestamp;
    this.graceExpired = false;

    const wrist = rawLandmarks[LANDMARK.WRIST];
    const thumbTip = rawLandmarks[LANDMARK.THUMB_TIP];
    const thumbMcp = rawLandmarks[LANDMARK.THUMB_MCP];
    const indexTip = rawLandmarks[LANDMARK.INDEX_TIP];
    const indexPip = rawLandmarks[LANDMARK.INDEX_PIP];
    const indexMcp = rawLandmarks[LANDMARK.INDEX_MCP];
    const middleTip = rawLandmarks[LANDMARK.MIDDLE_TIP];
    const middlePip = rawLandmarks[LANDMARK.MIDDLE_PIP];
    const middleMcp = rawLandmarks[LANDMARK.MIDDLE_MCP];
    const ringTip = rawLandmarks[LANDMARK.RING_TIP];
    const ringPip = rawLandmarks[LANDMARK.RING_PIP];
    const pinkyTip = rawLandmarks[LANDMARK.PINKY_TIP];
    const pinkyPip = rawLandmarks[LANDMARK.PINKY_PIP];

    // Invariant hand scale: palm base to middle knuckle.
    const handSpan = Math.hypot(
      middleMcp.x - wrist.x,
      middleMcp.y - wrist.y,
      middleMcp.z - wrist.z,
    );

    // Euclidean distance between thumb and index tip.
    const pinchRaw = Math.hypot(
      thumbTip.x - indexTip.x,
      thumbTip.y - indexTip.y,
      thumbTip.z - indexTip.z,
    );

    const pinchDistance = pinchRaw / Math.max(0.01, handSpan);

    // --- 1. Open Palm Detection ---
    // Check extension of each finger: distance from wrist to tip vs wrist to PIP
    const dist = (p1: HandPoint, p2: HandPoint) => Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);

    const indexExtended = dist(wrist, indexTip) > 1.25 * dist(wrist, indexPip);
    const middleExtended = dist(wrist, middleTip) > 1.25 * dist(wrist, middlePip);
    const ringExtended = dist(wrist, ringTip) > 1.25 * dist(wrist, ringPip);
    const pinkyExtended = dist(wrist, pinkyTip) > 1.25 * dist(wrist, pinkyPip);
    const thumbExtended = dist(wrist, thumbTip) > 1.15 * dist(wrist, thumbMcp);

    const isOpenPalm =
      indexExtended &&
      middleExtended &&
      ringExtended &&
      pinkyExtended &&
      thumbExtended &&
      pinchDistance > 0.7;

    // --- 2. Pinch Detection & Hysteresis ---
    let isPinching = this.wasPinching;

    // Open-palm acts as an explicit drop/cancel mechanism during a drag
    if (this.wasPinching && isOpenPalm) {
      isPinching = false;
    } else if (!this.wasPinching && pinchDistance < this.config.pinchInThreshold) {
      isPinching = true;
    } else if (this.wasPinching && pinchDistance > this.config.pinchOutThreshold) {
      isPinching = false;
    }

    // --- 3. Pointer Position & Smoothing ---
    // Cursor tracks index tip when pointing/open, or pinch midpoint when pinched
    const targetPoint = isPinching
      ? { x: (thumbTip.x + indexTip.x) * 0.5, y: (thumbTip.y + indexTip.y) * 0.5 }
      : { x: indexTip.x, y: indexTip.y };

    // Mirror horizontally so webcam movement matches mirror perception
    const rawX = 1 - targetPoint.x;
    const rawY = targetPoint.y;

    const smoothed = this.smoother.filter(rawX, rawY, timestamp);

    // Normalized Device Coordinates [-1..1], +y up
    const screenNdc = {
      x: smoothed.x * 2 - 1,
      y: -(smoothed.y * 2 - 1),
    };

    // Update position history for swipe detection
    this.positionHistory.push({ x: screenNdc.x, y: screenNdc.y, time: timestamp });
    // Keep only last 350ms
    while (this.positionHistory.length > 0 && timestamp - this.positionHistory[0].time > 350) {
      this.positionHistory.shift();
    }

    // --- 4. Double Pinch & Activation Detection ---
    let intent: GestureIntent = 'default';

    if (isPinching && !this.wasPinching) {
      // Pinch started
      this.pinchStartTime = timestamp;
      this.pinchStartPos = { x: smoothed.x, y: smoothed.y };
      this.isPinchStationary = true;
      this.resizeModeActive = false;
    } else if (isPinching && this.wasPinching) {
      // Continuing pinch
      const moveDist = Math.hypot(smoothed.x - this.pinchStartPos.x, smoothed.y - this.pinchStartPos.y);
      if (moveDist > TAP_MAX_TRAVEL) {
        this.isPinchStationary = false;
      }

      // Pinch & Hold for Resize mode: if held in place for > pinchHoldResizeMs
      if (this.isPinchStationary && timestamp - this.pinchStartTime >= this.config.pinchHoldResizeMs) {
        this.resizeModeActive = true;
      }

      intent = this.resizeModeActive ? 'scale' : 'move';
    } else if (!isPinching && this.wasPinching) {
      // Pinch ended
      const duration = timestamp - this.pinchStartTime;
      this.resizeModeActive = false;

      // Check if it was a quick stationary tap (candidate for double pinch)
      if (duration < TAP_MAX_MS && this.isPinchStationary) {
        const interval = timestamp - this.lastTapEndTime;
        if (interval < this.config.doublePinchIntervalMs && interval > 60) {
          // Double pinch detected!
          this.pendingActivation = true;
          this.lastTapEndTime = 0;
        } else {
          this.lastTapEndTime = timestamp;
        }
      }
    }

    if (this.pendingActivation) {
      this.pendingActivation = false;
      intent = 'activate';
    }

    // --- 5. Swipe Workspace Navigation ---
    let swipeDirection: 'left' | 'right' | null = null;
    let isSwipe = false;

    if (isOpenPalm && !isPinching && timestamp - this.lastSwipeAt >= this.config.swipeCooldownMs) {
      if (this.positionHistory.length >= 3) {
        const oldest = this.positionHistory[0];
        const dt = Math.max(0.001, (timestamp - oldest.time) / 1000);
        const dx = screenNdc.x - oldest.x;
        const dy = screenNdc.y - oldest.y;
        const vx = dx / dt;

        if (
          Math.abs(vx) >= this.config.swipeVelocityThreshold &&
          Math.abs(dx) >= this.config.swipeDisplacementThreshold &&
          Math.abs(dx) > 1.8 * Math.abs(dy)
        ) {
          isSwipe = true;
          // In mirrored screen space: moving hand right is +dx, moving hand left is -dx
          swipeDirection = dx > 0 ? 'right' : 'left';
          this.lastSwipeAt = timestamp;
          this.positionHistory = [];
        }
      }
    }

    // --- 6. State Machine Determination ---
    let gesture: GestureState;

    if (intent === 'activate') {
      gesture = 'DOUBLE_PINCH';
    } else if (isSwipe) {
      gesture = 'SWIPE';
    } else if (isPinching) {
      if (!this.wasPinching || this.lastGesture === 'IDLE' || this.lastGesture === 'POINT' || this.lastGesture === 'OPEN_PALM') {
        gesture = 'PINCH_START';
      } else {
        gesture = 'PINCHING';
      }
    } else if (this.wasPinching) {
      gesture = 'PINCH_END';
    } else if (isOpenPalm) {
      gesture = 'OPEN_PALM';
    } else {
      gesture = 'POINT';
    }

    this.wasPinching = isPinching;
    this.lastGesture = gesture;

    const frame: HandFrame = {
      detected: true,
      confidence,
      landmarks: rawLandmarks,
      indexTip,
      thumbTip,
      wrist,
      indexMcp,
      middleMcp,
      pinchDistance,
      isPinching,
      isOpenPalm,
      swipeDirection,
      intent,
      gesture,
      rawIndex: { x: smoothed.x, y: smoothed.y },
      screenNdc,
      timestamp,
    };

    this.lastKnownFrame = frame;
    return frame;
  }

  private handleHandLoss(timestamp: number): HandFrame | null {
    if (!this.lastKnownFrame || this.graceExpired) {
      return null;
    }

    const elapsed = timestamp - this.lastDetectedAt;
    if (elapsed < this.config.handLossGraceMs) {
      return {
        ...this.lastKnownFrame,
        detected: false,
        timestamp,
      };
    }

    this.graceExpired = true;

    if (this.wasPinching || this.lastGesture === 'PINCHING' || this.lastGesture === 'PINCH_START') {
      this.wasPinching = false;
      this.lastGesture = 'PINCH_END';
      const releaseFrame: HandFrame = {
        ...this.lastKnownFrame,
        detected: false,
        isPinching: false,
        gesture: 'PINCH_END',
        intent: 'default',
        timestamp,
      };
      this.lastKnownFrame = null;
      return releaseFrame;
    }

    this.lastKnownFrame = null;
    this.lastGesture = 'IDLE';
    return null;
  }
}

export { HAND_CONNECTIONS, LANDMARK };
