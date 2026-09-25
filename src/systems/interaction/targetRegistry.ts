import type { Object3D } from 'three';

/**
 * Raycast proxies for everything the user can point at.
 *
 * Window *content* is DOM (crisp text, cheap to draw); its *physical presence* in
 * the scene is a thin slab mesh registered here. The interaction system talks only
 * to these proxies, so it never needs to know how anything is drawn.
 */
export type TargetKind = 'window' | 'core';

const targets = new Map<string, Object3D>();

export function registerTarget(id: string, kind: TargetKind, object: Object3D) {
  object.userData.targetId = id;
  object.userData.targetKind = kind;
  targets.set(id, object);
}

export function unregisterTarget(id: string) {
  targets.delete(id);
}

export function spatialTargets(): Object3D[] {
  return [...targets.values()];
}

export const CORE_TARGET_ID = '__nova-core__';
