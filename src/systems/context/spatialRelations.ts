import type { SpatialPosition } from '../../types/spatial';
import type { ContextRelation, SpatialRelationship } from '../../types/context';

/**
 * Geometry to meaning.
 *
 * Every function here is pure and takes plain values, so a relation can be
 * reasoned about — and tested — without a store, a scene or a frame loop.
 *
 * The rule the whole file exists to enforce: NOVA never reports a coordinate as
 * a relation. "Browser is at x = -2.9" is not a fact about the user's work.
 * "Browser is left of Code, and beside it" is.
 */

/** The minimum a thing needs to be placed in relation to another thing. */
export interface RelatableObject {
  id: string;
  position: SpatialPosition;
  width: number;
  height: number;
  scale: number;
}

/**
 * Tuning. These are perceptual thresholds, not physics — they encode when a
 * person would agree with the sentence NOVA is about to form.
 */
export const RELATION_TUNING = {
  /** Centre distance at or under which two surfaces read as being together. */
  near: 3.4,
  /** Centre distance at or over which they read as unrelated in space. */
  far: 6.2,
  /** Edge-to-edge gap under which two surfaces read as adjacent. */
  adjacentGap: 1.7,
  /** Vertical drift allowed before side-by-side stops reading as "beside". */
  besideDrift: 1.35,
  /** Depth difference allowed before adjacency stops holding. */
  adjacentDepth: 1.4,
  /**
   * An axis must carry at least this share of the total separation before its
   * relation is strong enough to answer "which one is on the right?".
   */
  dominance: 0.5,
} as const;

const halfWidth = (o: RelatableObject) => (o.width * o.scale) / 2;
const halfHeight = (o: RelatableObject) => (o.height * o.scale) / 2;

export function distanceBetween(a: RelatableObject, b: RelatableObject): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const dz = a.position.z - b.position.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The dominant axis relation of `subject` relative to `reference`.
 *
 * Strength is the share of the total separation carried by the winning axis, so
 * a window directly to the right scores near 1 while one sitting diagonally
 * scores near 0.5 — which is exactly the signal a caller needs to decide that
 * "the one on the right" has no single obvious answer.
 */
export function axisRelation(
  subject: RelatableObject,
  reference: RelatableObject,
): { relation: ContextRelation; strength: number } | null {
  const dx = subject.position.x - reference.position.x;
  const dy = subject.position.y - reference.position.y;
  const dz = subject.position.z - reference.position.z;

  const total = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  if (total < 0.001) return null;

  const axes: Array<{ relation: ContextRelation; magnitude: number }> = [
    { relation: dx >= 0 ? 'right' : 'left', magnitude: Math.abs(dx) },
    { relation: dy >= 0 ? 'above' : 'below', magnitude: Math.abs(dy) },
    // +z is toward the user, so a larger z is nearer the front of the room.
    { relation: dz >= 0 ? 'front' : 'behind', magnitude: Math.abs(dz) },
  ];

  const winner = axes.reduce((best, axis) => (axis.magnitude > best.magnitude ? axis : best));
  return { relation: winner.relation, strength: clamp01(winner.magnitude / total) };
}

/** Distance read as a relation. Returns null in the middle band, honestly. */
export function proximity(
  subject: RelatableObject,
  reference: RelatableObject,
): { relation: 'near' | 'far'; strength: number } | null {
  const distance = distanceBetween(subject, reference);
  if (distance <= RELATION_TUNING.near) {
    return { relation: 'near', strength: clamp01(1 - distance / RELATION_TUNING.near) };
  }
  if (distance >= RELATION_TUNING.far) {
    return { relation: 'far', strength: clamp01(distance / (RELATION_TUNING.far * 2)) };
  }
  return null;
}

/** Edge-to-edge gap on an axis. Negative means the surfaces overlap. */
function gapX(a: RelatableObject, b: RelatableObject): number {
  return Math.abs(a.position.x - b.position.x) - (halfWidth(a) + halfWidth(b));
}

function gapY(a: RelatableObject, b: RelatableObject): number {
  return Math.abs(a.position.y - b.position.y) - (halfHeight(a) + halfHeight(b));
}

/**
 * Side by side: shoulder to shoulder at roughly the same height and depth.
 * This is the relation "put it beside my code" asks for, and the one the
 * acceptance test checks after a move.
 */
export function isBeside(a: RelatableObject, b: RelatableObject): boolean {
  if (Math.abs(a.position.y - b.position.y) > RELATION_TUNING.besideDrift) return false;
  if (Math.abs(a.position.z - b.position.z) > RELATION_TUNING.adjacentDepth) return false;
  const gap = gapX(a, b);
  return gap <= RELATION_TUNING.adjacentGap;
}

/**
 * Neighbouring on any axis. Broader than `beside` on purpose: a terminal
 * tucked under an editor is "next to" it even though nobody would call it
 * "beside" it.
 */
export function isNextTo(a: RelatableObject, b: RelatableObject): boolean {
  if (Math.abs(a.position.z - b.position.z) > RELATION_TUNING.adjacentDepth) return false;
  const horizontal = gapX(a, b) <= RELATION_TUNING.adjacentGap;
  const vertical = gapY(a, b) <= RELATION_TUNING.adjacentGap;
  // Adjacent along one axis while still overlapping the other — a diagonal
  // neighbour touching at a corner is not "next to" anything in plain speech.
  return (horizontal && gapY(a, b) <= 0) || (vertical && gapX(a, b) <= 0);
}

/**
 * The single relation that best answers "where is A relative to B?".
 *
 * Adjacency outranks the axis reading because it carries more information:
 * knowing two surfaces sit side by side says more about the work than knowing
 * one has a larger x.
 */
export function getSpatialRelation(
  subject: RelatableObject,
  reference: RelatableObject,
): ContextRelation | null {
  if (subject.id === reference.id) return null;
  if (isBeside(subject, reference)) return 'beside';
  return axisRelation(subject, reference)?.relation ?? null;
}

/**
 * Every relation that holds between `subject` and each of `others`.
 *
 * Cost is O(n) per subject and the caller runs it once per window, so a full
 * graph is O(n²) over a handful of windows — a few hundred arithmetic
 * operations, rebuilt only when a command changes state, never per frame.
 */
export function deriveRelationships(
  subject: RelatableObject,
  others: RelatableObject[],
): SpatialRelationship[] {
  const relationships: SpatialRelationship[] = [];

  for (const other of others) {
    if (other.id === subject.id) continue;

    const axis = axisRelation(subject, other);
    if (axis) {
      relationships.push({ relation: axis.relation, target: other.id, strength: axis.strength });
    }

    if (isBeside(subject, other)) {
      relationships.push({ relation: 'beside', target: other.id, strength: 0.9 });
    }
    if (isNextTo(subject, other)) {
      relationships.push({ relation: 'next_to', target: other.id, strength: 0.85 });
    }

    const closeness = proximity(subject, other);
    if (closeness) {
      relationships.push({
        relation: closeness.relation,
        target: other.id,
        strength: closeness.strength,
      });
    }
  }

  return relationships;
}
