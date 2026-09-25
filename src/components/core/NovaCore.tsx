import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh, MeshBasicMaterial, PointLight } from 'three';
import { spatial } from '../../state/spatialStore';
import {
  CORE_TARGET_ID,
  registerTarget,
  unregisterTarget,
} from '../../systems/interaction/targetRegistry';
import { cursor } from '../../systems/interaction/interactionSystem';
import { clamp, damp } from '../../utils/math';
import { createSoftShadowTexture } from '../../utils/textures';

const RADIUS = 0.2;
/** How long an acknowledgement takes to fade out. */
const PULSE_MS = 1100;

/**
 * NOVA Core.
 *
 * The system's presence in the space: a small glass body that acknowledges what
 * NOVA is doing. It is deliberately quiet — it brightens briefly when the system
 * acts and holds a steady glow while it is listening. Nothing about it loops for
 * decoration, and it never becomes the brightest thing on screen.
 */
export function NovaCore() {
  const shadowTexture = useMemo(() => createSoftShadowTexture(), []);
  const groupRef = useRef<Group>(null);
  const bodyRef = useRef<Group>(null);
  const nucleusRef = useRef<Mesh>(null);
  const nucleusMaterialRef = useRef<MeshBasicMaterial>(null);
  const ringMaterialRef = useRef<MeshBasicMaterial>(null);
  const lightRef = useRef<PointLight>(null);
  const hitRef = useRef<Mesh>(null);
  const activityRef = useRef(0);
  const hoverRef = useRef(0);

  useEffect(() => {
    const hit = hitRef.current;
    if (!hit) return;
    registerTarget(CORE_TARGET_ID, 'core', hit);
    return () => unregisterTarget(CORE_TARGET_ID);
  }, []);

  useEffect(() => {
    const core = spatial().core.position;
    groupRef.current?.position.set(core.x, core.y, core.z);
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const body = bodyRef.current;
    if (!group || !body) return;

    const dt = Math.min(delta, 1 / 30);
    const store = spatial();
    const target = store.core.position;

    group.position.x = damp(group.position.x, target.x, 3.6, dt);
    group.position.y = damp(group.position.y, target.y, 3.6, dt);
    group.position.z = damp(group.position.z, target.z, 3.6, dt);

    // Acknowledgement decays; listening holds a floor under it.
    const sincePulse = (performance.now() - store.core.pulseAt) / PULSE_MS;
    const pulse = clamp(1 - sincePulse, 0, 1) ** 2;
    const floor = store.core.state === 'listening' ? 0.5 : store.core.state === 'working' ? 0.75 : 0;
    activityRef.current = damp(activityRef.current, Math.max(pulse, floor), 7, dt);

    hoverRef.current = damp(hoverRef.current, cursor.hoveredId === CORE_TARGET_ID ? 1 : 0, 9, dt);

    const activity = activityRef.current;
    const presence = clamp(activity + hoverRef.current * 0.4, 0, 1);

    body.rotation.y += dt * (0.05 + activity * 0.3);
    body.rotation.x = damp(body.rotation.x, -0.14 + activity * 0.06, 4, dt);
    body.scale.setScalar(damp(body.scale.x, 1 + presence * 0.06, 8, dt));

    if (nucleusRef.current && nucleusMaterialRef.current) {
      const scale = 0.48 + presence * 0.22;
      nucleusRef.current.scale.setScalar(damp(nucleusRef.current.scale.x, scale, 8, dt));
      nucleusMaterialRef.current.opacity = 0.3 + presence * 0.38;
    }

    if (ringMaterialRef.current) ringMaterialRef.current.opacity = 0.3 + presence * 0.22;

    // Light rather than a glowing shell: the Core lifts the space around it.
    if (lightRef.current) lightRef.current.intensity = presence * 0.5;
  });

  return (
    <group ref={groupRef}>
      {/* Generous, invisible hit volume — pointing at the Core should be easy. */}
      <mesh ref={hitRef} visible={false}>
        <sphereGeometry args={[RADIUS * 1.9, 12, 8]} />
        <meshBasicMaterial />
      </mesh>

      <pointLight ref={lightRef} color="#5B5CE2" intensity={0} distance={1.9} decay={2} />

      {/* Weight. Nothing sits close enough behind the Core to catch a cast shadow,
          so it carries its own — a soft darkening that travels with it. */}
      <mesh position={[0.03, -0.04, -0.3]} scale={[0.82, 0.7, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={shadowTexture}
          transparent
          opacity={0.42}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <group ref={bodyRef}>
        {/* Faceted rather than smooth: the flats catch the environment at
            different angles, which is what makes it read as cut glass. */}
        <mesh castShadow>
          <icosahedronGeometry args={[RADIUS, 2]} />
          <meshPhysicalMaterial
            color="#FFFFFF"
            roughness={0.06}
            metalness={0}
            clearcoat={1}
            clearcoatRoughness={0.04}
            envMapIntensity={2.9}
            reflectivity={0.72}
            flatShading
            transparent
            opacity={0.52}
          />
        </mesh>

        <mesh ref={nucleusRef} scale={0.48}>
          <icosahedronGeometry args={[RADIUS, 2]} />
          <meshBasicMaterial
            ref={nucleusMaterialRef}
            color="#5B5CE2"
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>

        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RADIUS * 1.12, 0.0036, 6, 96]} />
          <meshBasicMaterial ref={ringMaterialRef} color="#2A2C31" transparent opacity={0.3} />
        </mesh>
      </group>
    </group>
  );
}
