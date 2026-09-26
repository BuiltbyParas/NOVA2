import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, ShaderMaterial } from 'three';
import type { Group, Mesh, MeshBasicMaterial, PointLight } from 'three';
import { PALETTE } from '../../data/environment';
import { spatial } from '../../state/spatialStore';
import {
  CORE_TARGET_ID,
  registerTarget,
  unregisterTarget,
} from '../../systems/interaction/targetRegistry';
import { cursor } from '../../systems/interaction/interactionSystem';
import { clamp, damp } from '../../utils/math';
import { createSoftShadowTexture } from '../../utils/textures';
import { prefersReducedMotion, readAmbientSignals } from '../../systems/environment/ambience';
import { portalScreen } from '../../systems/portal/portalScreen';

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
 *
 * Phase 11C/11D: clear glass that catches thin highlights, holding a small
 * warm light — the bloom's heart in miniature — that turns to the accent while
 * NOVA acts.
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
  const haloRef = useRef<Mesh>(null);
  const haloTime = useRef(0);

  // The portal's halo (Phase 12): the Core's presence as the way in.
  const haloMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uHover: { value: 0 },
          uCharge: { value: 0 },
          uOpen: { value: 0 },
          uCell: { value: 4 },
          uPearl: { value: new Color(PALETTE.pearl) },
          uWarm: { value: new Color(PALETTE.warmWhite) },
          uAmber: { value: new Color(PALETTE.amber) },
          uCyan: { value: new Color(PALETTE.cyan) },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => haloMaterial.dispose(), [haloMaterial]);

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

  useFrame(({ camera, gl }, delta) => {
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
    // Phase 11: the Core also answers for the microphone and the Intelligence
    // Core, reading the same signals the room does, so NOVA's presence and the
    // light beneath it always agree.
    const ambient = readAmbientSignals();
    const floor = Math.max(
      store.core.state === 'listening' ? 0.5 : store.core.state === 'working' ? 0.75 : 0,
      ambient.thinking ? 0.75 : ambient.listening ? 0.5 : 0,
    );
    activityRef.current = damp(activityRef.current, Math.max(pulse, floor), 7, dt);

    hoverRef.current = damp(hoverRef.current, cursor.hoveredId === CORE_TARGET_ID ? 1 : 0, 9, dt);

    const activity = activityRef.current;
    const presence = clamp(activity + hoverRef.current * 0.4, 0, 1);

    body.rotation.y += dt * (0.05 + activity * 0.3);
    body.rotation.x = damp(body.rotation.x, -0.14 + activity * 0.06, 4, dt);
    body.scale.setScalar(damp(body.scale.x, 1 + presence * 0.06, 8, dt));

    if (nucleusRef.current && nucleusMaterialRef.current) {
      const scale = 0.34 + presence * 0.2;
      nucleusRef.current.scale.setScalar(damp(nucleusRef.current.scale.x, scale, 8, dt));
      nucleusMaterialRef.current.opacity = 0.22 + presence * 0.5;
      nucleusMaterialRef.current.color.lerpColors(NUCLEUS_REST, NUCLEUS_ACTIVE, presence);
    }

    if (ringMaterialRef.current) ringMaterialRef.current.opacity = 0.16 + presence * 0.3;

    // Light rather than a glowing shell: the Core lifts the space around it.
    if (lightRef.current) lightRef.current.intensity = presence * 0.5;

    // The halo faces the viewer and answers hover, the portal's charge and its opening.
    const halo = haloRef.current;
    if (halo) {
      halo.quaternion.copy(camera.quaternion);
      const u = (halo.material as ShaderMaterial).uniforms;
      haloTime.current += prefersReducedMotion() ? 0 : dt;
      u.uTime.value = haloTime.current;
      u.uHover.value = hoverRef.current;
      u.uCharge.value = portalScreen.charge;
      u.uOpen.value = portalScreen.progress;
      u.uCell.value = 3 * gl.getPixelRatio();
    }
  });

  return (
    <group ref={groupRef}>
      {/* Generous, invisible hit volume — pointing at the Core should be easy. */}
      <mesh ref={hitRef} visible={false}>
        <sphereGeometry args={[RADIUS * 1.9, 12, 8]} />
        <meshBasicMaterial />
      </mesh>

      {/* The portal's halo: rings of light-dots around the Core. */}
      <mesh ref={haloRef} material={haloMaterial} renderOrder={3}>
        <planeGeometry args={[HALO_SIZE, HALO_SIZE]} />
      </mesh>

      <pointLight ref={lightRef} color="#5B5CE2" intensity={0} distance={1.9} decay={2} />

      {/* Weight. Nothing sits close enough behind the Core to catch a cast shadow,
          so it carries its own — a soft darkening that travels with it (faint in the
          dark room, where a heavy shadow would cut a hole in the floor's dots). */}
      <mesh position={[0.03, -0.04, -0.3]} scale={[0.82, 0.7, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={shadowTexture}
          transparent
          opacity={0.04}
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
            color="#AAB4C2"
            roughness={0.06}
            metalness={0}
            clearcoat={1}
            clearcoatRoughness={0.04}
            envMapIntensity={1.6}
            reflectivity={0.72}
            flatShading
            transparent
            opacity={0.12}
            depthWrite={false}
          />
        </mesh>

        <mesh ref={nucleusRef} scale={0.34} renderOrder={2}>
          <icosahedronGeometry args={[RADIUS, 2]} />
          <meshBasicMaterial
            ref={nucleusMaterialRef}
            color={PALETTE.bloomCore}
            transparent
            opacity={0.22}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>

        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RADIUS * 1.12, 0.0036, 6, 96]} />
          <meshBasicMaterial ref={ringMaterialRef} color={PALETTE.light} transparent opacity={0.16} />
        </mesh>
      </group>
    </group>
  );
}

/** The nucleus at rest (the bloom's warm heart) and while NOVA acts (the accent). */
const NUCLEUS_REST = new Color(PALETTE.bloomCore);
const NUCLEUS_ACTIVE = new Color(PALETTE.accent);

/** The halo plane's side, in world units. */
const HALO_SIZE = 1.5;

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The portal's halo (Phase 12), in the room's dot-matrix language.
 *
 * At rest: a slow-breathing ring of pearl light-dots around the Core, with a
 * warm glow at its heart, so the Core reads as a way in rather than an ornament.
 * Hover (pointer or hand): the ring widens a little and takes cyan — you are
 * interacting. Activation: the heart gathers warm light and the ring flares
 * outward as the applications leave. While open: a wider ring, light
 * travelling slowly round it.
 */
const HALO_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uHover;
  uniform float uCharge;
  uniform float uOpen;
  uniform float uCell;
  uniform vec3 uPearl;
  uniform vec3 uWarm;
  uniform vec3 uAmber;
  uniform vec3 uCyan;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;           // -1..1 across the halo
    float r = length(p);
    float angle = atan(p.y, p.x);

    float breath = 0.5 + 0.5 * sin(uTime * 0.9);
    float radius = 0.36 + 0.03 * breath + 0.05 * uHover + 0.16 * uOpen + 0.08 * uCharge;
    float ring = exp(-pow((r - radius) * 60.0, 2.0));
    float outer = exp(-pow((r - radius * 1.5) * 80.0, 2.0)) * uOpen;
    float travel = 0.35 + 0.65 * pow(0.5 + 0.5 * cos(angle * 2.0 - uTime * 0.7), 3.0);

    // LED cells: the ring is made of dots, as everything NOVA draws is.
    vec2 frag = gl_FragCoord.xy;
    vec2 d = frag - (floor(frag / uCell) + 0.5) * uCell;
    float cellDot = step(abs(d.x), 0.8) * step(abs(d.y), 0.8);

    float heart = exp(-r * r * 40.0) * (0.12 + 0.05 * breath + 0.5 * uCharge);
    vec3 ringColor = mix(uPearl, uCyan, clamp(uHover * 0.8, 0.0, 1.0));
    ringColor = mix(ringColor, mix(uWarm, uAmber, 0.3), uCharge * 0.7);
    vec3 color = ringColor * (ring * (0.22 + 0.25 * uHover + 0.45 * uCharge) * travel + outer * 0.2 * travel) * (0.2 + 0.8 * cellDot);
    color += ringColor * ring * 0.04;
    color += mix(uWarm, uAmber, 0.4) * heart * 0.45;
    gl_FragColor = vec4(color * smoothstep(1.0, 0.85, r), 1.0);
    #include <colorspace_fragment>
  }
`;
