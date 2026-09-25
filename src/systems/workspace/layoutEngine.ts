import type { SpatialPosition } from '../../types/spatial';
import type { SpatialWindow } from '../../types/window';
import type { SpatialRelation } from '../../types/command';

/** Gap left between two windows placed in relation to one another. */
const RELATION_GAP = 0.34;

const halfWidth = (win: SpatialWindow) => (win.width * win.scale) / 2;
const halfHeight = (win: SpatialWindow) => (win.height * win.scale) / 2;

/**
 * Turn a spatial *relation* into coordinates.
 *
 * This is what lets intent stay human: "browser left of code" is resolved here,
 * so the language layer never needs to know world units.
 */
export function resolveRelation(
  moving: SpatialWindow,
  relation: SpatialRelation,
  reference: SpatialWindow,
): SpatialPosition {
  const base = reference.position;
  switch (relation) {
    case 'left_of':
      return {
        x: base.x - (halfWidth(reference) + halfWidth(moving) + RELATION_GAP),
        y: base.y,
        z: base.z,
      };
    case 'right_of':
      return {
        x: base.x + (halfWidth(reference) + halfWidth(moving) + RELATION_GAP),
        y: base.y,
        z: base.z,
      };
    case 'above':
      return {
        x: base.x,
        y: base.y + (halfHeight(reference) + halfHeight(moving) + RELATION_GAP * 0.7),
        z: base.z,
      };
    case 'below':
      return {
        x: base.x,
        y: base.y - (halfHeight(reference) + halfHeight(moving) + RELATION_GAP * 0.7),
        z: base.z,
      };
    case 'in_front_of':
      return { x: base.x, y: base.y, z: base.z + 0.9 };
    case 'behind':
      return { x: base.x, y: base.y, z: base.z - 0.9 };
  }
}

/** Size of a window collapsed into the spatial dock, in spatial units. */
export const DOCK_TILE = { width: 0.46, height: 0.31 };

/**
 * Where the nth minimized window rests.
 *
 * Minimized windows do not disappear — they collapse into small slabs that flank
 * the Core, alternating outward so the Core's own screen region stays clear.
 */
export function dockSlot(index: number, core: SpatialPosition): SpatialPosition {
  const side = index % 2 === 0 ? -1 : 1;
  const lane = Math.floor(index / 2);
  return {
    x: core.x + side * (0.82 + lane * 0.54),
    y: core.y - 0.02,
    z: core.z - 0.04,
  };
}
