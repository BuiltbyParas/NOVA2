/**
 * Vision types and abstractions for NOVA.
 *
 * All MediaPipe-specific structures remain inside the vision layer;
 * upstream systems only interact with these NOVA-native types.
 */

export interface HandPoint {
  x: number;
  y: number;
  z: number;
}

export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const HAND_CONNECTIONS: ReadonlyArray<[number, number]> = [
  // Thumb
  [LANDMARK.WRIST, LANDMARK.THUMB_CMC],
  [LANDMARK.THUMB_CMC, LANDMARK.THUMB_MCP],
  [LANDMARK.THUMB_MCP, LANDMARK.THUMB_IP],
  [LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP],
  // Index
  [LANDMARK.WRIST, LANDMARK.INDEX_MCP],
  [LANDMARK.INDEX_MCP, LANDMARK.INDEX_PIP],
  [LANDMARK.INDEX_PIP, LANDMARK.INDEX_DIP],
  [LANDMARK.INDEX_DIP, LANDMARK.INDEX_TIP],
  // Middle
  [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP],
  [LANDMARK.MIDDLE_MCP, LANDMARK.MIDDLE_PIP],
  [LANDMARK.MIDDLE_PIP, LANDMARK.MIDDLE_DIP],
  [LANDMARK.MIDDLE_DIP, LANDMARK.MIDDLE_TIP],
  // Ring
  [LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP],
  [LANDMARK.RING_MCP, LANDMARK.RING_PIP],
  [LANDMARK.RING_PIP, LANDMARK.RING_DIP],
  [LANDMARK.RING_DIP, LANDMARK.RING_TIP],
  // Pinky
  [LANDMARK.RING_MCP, LANDMARK.PINKY_MCP],
  [LANDMARK.PINKY_MCP, LANDMARK.PINKY_PIP],
  [LANDMARK.PINKY_PIP, LANDMARK.PINKY_DIP],
  [LANDMARK.PINKY_DIP, LANDMARK.PINKY_TIP],
  // Palm base
  [LANDMARK.WRIST, LANDMARK.PINKY_MCP],
];

export type GestureState =
  | 'IDLE'
  | 'POINT'
  | 'PINCH_START'
  | 'PINCHING'
  | 'PINCH_END'
  | 'OPEN_PALM'
  | 'DOUBLE_PINCH'
  | 'SWIPE';

export type GestureIntent = 'move' | 'scale' | 'activate' | 'default';

export interface HandFrame {
  /** Whether a hand was successfully detected in this frame. */
  detected: boolean;
  /** Detection confidence (0..1). */
  confidence: number;
  /** All 21 normalized landmarks (x: 0..1, y: 0..1, z depth). */
  landmarks: HandPoint[];
  indexTip: HandPoint;
  thumbTip: HandPoint;
  wrist: HandPoint;
  indexMcp: HandPoint;
  middleMcp: HandPoint;
  /**
   * Distance between thumbTip and indexTip normalized by hand span.
   * Invariant to distance from camera.
   */
  pinchDistance: number;
  /** Whether the normalized distance is within the pinch threshold. */
  isPinching: boolean;
  /** Whether all 5 fingers are clearly extended and spread. */
  isOpenPalm: boolean;
  /** Direction if a horizontal workspace swipe occurred this frame. */
  swipeDirection: 'left' | 'right' | null;
  /** High-level interaction intent inferred from the gesture pattern. */
  intent: GestureIntent;
  /** Formal state machine gesture for this frame. */
  gesture: GestureState;
  /** Raw mirrored screen space [0..1]. */
  rawIndex: { x: number; y: number };
  /** Normalised device coordinates [-1..1], +y up for Three.js raycasting. */
  screenNdc: { x: number; y: number };
  /** Monotonic timestamp in milliseconds. */
  timestamp: number;
}

export interface VisionConfig {
  pinchInThreshold: number;
  pinchOutThreshold: number;
  smoothingMinCutoff: number;
  smoothingBeta: number;
  handLossGraceMs: number;
  doublePinchIntervalMs: number;
  swipeVelocityThreshold: number;
  swipeDisplacementThreshold: number;
  swipeCooldownMs: number;
  pinchHoldResizeMs: number;
}

export const DEFAULT_VISION_CONFIG: VisionConfig = {
  pinchInThreshold: 0.38,
  pinchOutThreshold: 0.52,
  smoothingMinCutoff: 1.2,
  smoothingBeta: 0.015,
  handLossGraceMs: 250,
  doublePinchIntervalMs: 360,
  swipeVelocityThreshold: 1.2,
  swipeDisplacementThreshold: 0.2,
  swipeCooldownMs: 800,
  pinchHoldResizeMs: 500,
};
