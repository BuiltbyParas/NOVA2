import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { useSpatialStore, spatial } from '../../state/spatialStore';
import { WINDOW_CORNER_RADIUS, WINDOW_THICKNESS } from '../../data/environment';
import { createSlabGeometry } from '../../utils/geometry';
import { registerTarget, unregisterTarget } from '../../systems/interaction/targetRegistry';
import {
  ENTRY_TRANSITION_MS,
  dockOrderOf,
  presentWindow,
} from '../../systems/window/windowPresentation';
import { cursor, interaction } from '../../systems/interaction/interactionSystem';
import { clamp, damp } from '../../utils/math';
import { useSurfaceObject } from '../spatial/useSurfaceObject';
import { registerSurface, unregisterSurface } from './surfaceRegistry';

/** Only write to the DOM when a value has actually moved. */
function writeVar(element: HTMLElement, name: string, value: number, cache: Record<string, number>) {
  if (Math.abs((cache[name] ?? -999) - value) < 0.004) return;
  cache[name] = value;
  element.style.setProperty(name, value.toFixed(3));
}

export function SpatialWindowView({ id }: { id: string }) {
  // Only discrete facts are subscribed to. Transform values are read in the frame
  // loop instead, so dragging a window causes no React renders at all.
  const app = useSpatialStore((state) => state.windows[id]?.app);
  const title = useSpatialStore((state) => state.windows[id]?.title);
  const width = useSpatialStore((state) => state.windows[id]?.width);
  const height = useSpatialStore((state) => state.windows[id]?.height);

  const groupRef = useRef<Group>(null);
  const slabRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const collapseRef = useRef(0);
  const focusRef = useRef(0);
  const cacheRef = useRef<Record<string, number>>({});
  const settledRef = useRef(false);

  const { element, object } = useSurfaceObject(width ?? 1, height ?? 1);

  const geometry = useMemo(
    () =>
      createSlabGeometry(width ?? 1, height ?? 1, WINDOW_CORNER_RADIUS, WINDOW_THICKNESS),
    [width, height],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    element.className = 'nova-surface';
    if (!app || !title) return;
    registerSurface({ id, element, app, title });
    return () => unregisterSurface(id);
  }, [element, id, app, title]);

  useEffect(() => {
    const slab = slabRef.current;
    if (!slab) return;
    registerTarget(id, 'window', slab);
    return () => unregisterTarget(id);
  }, [id]);

  // Place the window at its starting transform before the first frame is drawn,
  // so nothing ever appears at the origin for a frame.
  useEffect(() => {
    const group = groupRef.current;
    const win = spatial().windows[id];
    if (!group || !win) return;
    group.position.set(win.position.x, win.position.y, win.position.z - 0.9);
    group.rotation.set(win.rotation.x, win.rotation.y, win.rotation.z);
    group.scale.setScalar(win.scale * 0.93);
  }, [id]);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const store = spatial();
    const win = store.windows[id];
    if (!win) return;

    const dt = Math.min(delta, 1 / 30);
    const now = performance.now();

    const presentation = presentWindow(win, {
      dockOrder: dockOrderOf(store.order, store.windows),
      corePosition: store.core.position,
      hoveredId: cursor.hoveredId,
      now,
    });

    // Being dragged means the window must track the pointer closely; otherwise it
    // settles, which is what makes moving one feel like moving an object.
    const dragging = interaction.activeId === id;
    const lambda = dragging ? 24 : win.focused ? 9 : 6.4;

    group.position.x = damp(group.position.x, presentation.position.x, lambda, dt);
    group.position.y = damp(group.position.y, presentation.position.y, lambda, dt);
    group.position.z = damp(group.position.z, presentation.position.z, lambda * 0.8, dt);

    group.rotation.x = damp(group.rotation.x, presentation.rotation.x, lambda * 0.9, dt);
    group.rotation.y = damp(group.rotation.y, presentation.rotation.y, lambda * 0.9, dt);
    group.rotation.z = damp(group.rotation.z, presentation.rotation.z, lambda * 0.9, dt);

    const scale = damp(group.scale.x, presentation.scale, lambda * 0.9, dt);
    group.scale.setScalar(scale);

    if (materialRef.current) materialRef.current.opacity = presentation.opacity;

    // Promote out of the entry transition exactly once.
    if (!settledRef.current && win.lifecycle === 'entering' && now - win.lifecycleAt >= ENTRY_TRANSITION_MS) {
      settledRef.current = true;
      store.patchWindow(id, { lifecycle: 'settled' });
    }

    // --- surface appearance ---------------------------------------------
    const distance = state.camera.position.distanceTo(group.position);
    const depthFactor = clamp((distance - 5.6) / 5.2, 0, 1);
    const defocused = store.focusedId !== null && !win.focused ? 1 : 0;

    // Driven at the same rate as the transform, so the face a window is showing
    // always matches the size it has actually reached.
    collapseRef.current = damp(collapseRef.current, presentation.collapsed ? 1 : 0, lambda * 0.9, dt);
    focusRef.current = damp(focusRef.current, win.focused ? 1 : 0, 8, dt);

    const cache = cacheRef.current;
    writeVar(element, '--opacity', presentation.opacity, cache);
    writeVar(element, '--collapse', collapseRef.current, cache);
    writeVar(element, '--focus', focusRef.current, cache);
    // Distance still removes contrast, but being merely unfocused no longer
    // does much of it: five windows that are all slightly veiled read as a
    // washed-out picture rather than as a room with one window in use. Focus is
    // carried by lift and by the hairline instead, which are additive rather
    // than subtractive.
    writeVar(element, '--scrim', clamp(depthFactor * 0.2 + defocused * 0.035, 0, 0.36), cache);

    if (store.quality === 'high') {
      writeVar(element, '--soften', clamp(depthFactor * 1.15 + defocused * 0.2, 0, 1.5), cache);
    } else if (cache['--soften'] !== 0) {
      cache['--soften'] = 0;
      element.style.setProperty('--soften', '0');
    }

    const control = cursor.hoveredId === id ? cursor.hoveredControl ?? '' : '';
    if (element.dataset.control !== control) element.dataset.control = control;

    const hovered = cursor.hoveredId === id ? '1' : '0';
    if (element.dataset.hovered !== hovered) element.dataset.hovered = hovered;

    const armed = cursor.armedId === id ? '1' : '0';
    if (element.dataset.armed !== armed) element.dataset.armed = armed;
  });

  if (!app || !title || !width || !height) return null;

  return (
    <group ref={groupRef}>
      <mesh ref={slabRef} geometry={geometry}>
        <meshStandardMaterial
          ref={materialRef}
          color="#ffffff"
          roughness={0.74}
          metalness={0}
          envMapIntensity={0.4}
          transparent
        />
      </mesh>
      <primitive object={object} position={[0, 0, WINDOW_THICKNESS / 2 + 0.004]} />
    </group>
  );
}
