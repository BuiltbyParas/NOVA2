import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { AdditiveBlending, Color, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { Group, Mesh } from 'three';
import { ENVIRONMENT, PALETTE } from '../../data/environment';
import {
  ambientTargets,
  coreMode,
  projectOntoWall,
  prefersReducedMotion,
  pulseProgress,
  readAmbientSignals,
  rippleProgress,
  setReducedMotion,
  startAmbience,
} from '../../systems/environment/ambience';
import { interaction } from '../../systems/interaction/interactionSystem';
import { microphoneLevel } from '../../systems/voice/microphone';
import { spatial } from '../../state/spatialStore';
import { SPATIAL_CORE_POSITION, spatialCoreLight } from './spatialCoreState';
import { damp } from '../../utils/math';
import { inputRouter } from '../../systems/input/inputRouter';
import {
  BACKDROP_FRAGMENT,
  BACKDROP_VERTEX,
  FLOOR_FRAGMENT,
  FLOOR_VERTEX,
  MIDGROUND_FRAGMENT,
  MIDGROUND_VERTEX,
} from './environmentShaders';

/**
 * The room.
 *
 * NOVA's environment is light, and a light environment is the harder one to
 * make read as a space: there is no darkness for objects to emerge from, so
 * every depth cue has to be earned. Phase 11 keeps the palette and deepens the
 * room in layers, back to front:
 *
 *   **The wall.** A far surface, brightest high up, meeting the floor at a soft
 *   horizon of light — the line that gives the room its scale.
 *
 *   **The stage light.** A wide, soft light at the centre of the room, behind the
 *   working volume. It is where attention settles, and where NOVA's own activity
 *   shows as the faintest trace of accent.
 *
 *   **The field.** A world-space grid on the floor, with two faint rings around
 *   the stage. Perspective converges it, which says "this continues away from
 *   you" more cheaply than any lighting.
 *
 *   **The haze.** Fog, tuned to lift distant surfaces away rather than fade them.
 *
 *   **The light.** Mostly ambient, with one soft key. Shadows stay as weight an
 *   object carries beneath itself, never dark shapes on a wall.
 *
 * The room responds only to real state — a hand in view firms the grids; NOVA
 * listening or thinking tints the stage light with the accent; an application
 * opening sends one ring of light across the wall behind it — and the frame loop
 * below does nothing but ease a few numbers towards those targets.
 */

export function EnvironmentRig() {
  // The frame loop reaches the materials through their meshes: refs are the
  // mutable handle React expects a render loop to write through.
  const wallRef = useRef<Mesh>(null);
  const floorRef = useRef<Mesh>(null);
  const farRef = useRef<Group>(null);
  const midRef = useRef<Group>(null);
  const midPlaneRef = useRef<Mesh>(null);
  const time = useRef(0);
  const lastNow = useRef(0);
  // The bloom's flare, as a wave leaving it: when it started, and whether one is under way.
  const flareWaveAt = useRef(-1);
  const wasFlaring = useRef(false);

  const backdrop = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BACKDROP_VERTEX,
        fragmentShader: BACKDROP_FRAGMENT,
        uniforms: {
          uWallHigh: { value: new Color(PALETTE.wallHigh) },
          uWallLow: { value: new Color(PALETTE.wallLow) },
          uFloorFar: { value: new Color(PALETTE.floorFar) },
          uFloorNear: { value: new Color(PALETTE.floorNear) },
          uAccent: { value: new Color(PALETTE.accent) },
          uGlow: { value: 0 },
          uWake: { value: 0 },
          uTime: { value: 0 },
          uLight: { value: new Color(PALETTE.light) },
          ...fieldColours(),
          uFlowTime: { value: 0 },
          uEnergy: { value: 0 },
          uLevel: { value: 0 },
          uDetail: { value: 1 },
          uPointer: { value: new Vector2(0, 0) },
          uPointerOn: { value: 0 },
          uHandOn: { value: 0 },
          uWave: { value: -1 },
          uCommand: { value: -1 },
          uFlareWave: { value: -1 },
          uCell: { value: 6 },
          uSize: { value: new Vector2(ENVIRONMENT.backdrop.width, ENVIRONMENT.backdrop.height) },
          uFloorY: { value: ENVIRONMENT.floor.y },
          uRipple: { value: new Vector3(0, 0, -1) },
          uCore: { value: new Vector2(0, 0) },
        },
        // The wall writes depth, so the part of the floor plane that lies
        // beyond it is hidden rather than drawn over it.
      }),
    [],
  );

  const field = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FLOOR_VERTEX,
        fragmentShader: FLOOR_FRAGMENT,
        uniforms: {
          uInk: { value: new Color(PALETTE.ink) },
          uAccent: { value: new Color(PALETTE.accent) },
          uStage: { value: new Vector2(ENVIRONMENT.stage.x, ENVIRONMENT.stage.z) },
          uWake: { value: 0 },
          uGlow: { value: 0 },
          uPulse: { value: -1 },
          uTime: { value: 0 },
          uLight: { value: new Color(PALETTE.light) },
          ...fieldColours(),
        },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  const haze = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: MIDGROUND_VERTEX,
        fragmentShader: MIDGROUND_FRAGMENT,
        uniforms: {
          ...fieldColours(),
          uAccent: { value: new Color(PALETTE.accent) },
          uSize: { value: new Vector2(ENVIRONMENT.midground.width, ENVIRONMENT.midground.height) },
          uCore: { value: new Vector2(0, 0) },
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uGlow: { value: 0 },
          uDetail: { value: 1 },
          uCell: { value: 6 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );

  // Materials are this component's to release; the ambience listeners too.
  useEffect(() => {
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    setReducedMotion(Boolean(motion?.matches));
    const onMotion = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    motion?.addEventListener?.('change', onMotion);
    const stop = startAmbience();
    return () => {
      stop();
      motion?.removeEventListener?.('change', onMotion);
      backdrop.dispose();
      field.dispose();
      haze.dispose();
    };
  }, [backdrop, field, haze]);

  // Arithmetic only: read a few store values, ease a few uniforms. No
  // allocation, no I/O, no React state.
  useFrame(({ camera, gl }, delta) => {
    const wall = wallRef.current?.material as ShaderMaterial | undefined;
    const floor = floorRef.current?.material as ShaderMaterial | undefined;
    if (!wall || !floor) return;

    const dt = Math.min(delta, 1 / 30);
    const now = performance.now();
    const signals = readAmbientSignals(now);
    const targets = ambientTargets(signals);

    const wake = damp(floor.uniforms.uWake.value as number, targets.wake, 2.4, dt);
    const glow = damp(wall.uniforms.uGlow.value as number, targets.glow, 3.2, dt);
    floor.uniforms.uWake.value = wake;
    floor.uniforms.uGlow.value = glow;
    wall.uniforms.uWake.value = wake;
    wall.uniforms.uGlow.value = glow;
    floor.uniforms.uPulse.value = pulseProgress('open', now) ?? -1;

    // The room's slow breath, drift and flow run on real elapsed time (capped, so
    // a backgrounded tab does not leap); all of it holds still under reduced motion.
    const still = prefersReducedMotion();
    const elapsed = lastNow.current ? Math.min((now - lastNow.current) / 1000, 1) : 0;
    lastNow.current = now;
    time.current += still ? 0 : elapsed;
    wall.uniforms.uTime.value = time.current;
    floor.uniforms.uTime.value = time.current;
    wall.uniforms.uFlowTime.value = time.current;

    // The field's state: how fast and bright it flows, the voice it follows.
    const mode = coreMode(signals);
    const settle = pulseProgress('settle', now);
    const energyTarget =
      (mode === 'thinking' ? 1 : mode === 'listening' ? 0.45 : mode === 'hand' ? 0.15 : 0) +
      (settle === null ? 0 : (1 - settle) * 0.5);
    wall.uniforms.uEnergy.value = damp(wall.uniforms.uEnergy.value as number, Math.min(energyTarget, 1), 1.6, dt);
    const level = mode === 'listening' ? Math.min(microphoneLevel() * 2.5, 1) : 0;
    wall.uniforms.uLevel.value = damp(wall.uniforms.uLevel.value as number, level, 6, dt);
    wall.uniforms.uDetail.value = spatial().quality === 'high' ? 1 : 0;
    wall.uniforms.uCell.value = 6 * gl.getPixelRatio();
    const wave = pulseProgress('open', now);
    wall.uniforms.uWave.value = wave ?? -1;
    wall.uniforms.uCommand.value = pulseProgress('command', now) ?? -1;

    // The bloom's flare sends a wave of light into the space around it: one wave
    // per flare, starting as the flare rises.
    const flaring = spatialCoreLight.flare > 0.08;
    if (flaring && !wasFlaring.current && !still) flareWaveAt.current = now;
    wasFlaring.current = flaring;
    const flareWave = flareWaveAt.current < 0 ? -1 : (now - flareWaveAt.current) / FLARE_WAVE_MS;
    wall.uniforms.uFlareWave.value = flareWave >= 0 && flareWave <= 1 ? flareWave : -1;

    // The mid layer: its own time, and NOVA's activity.
    const mid = midPlaneRef.current?.material as ShaderMaterial | undefined;
    if (mid) {
      mid.uniforms.uTime.value = time.current;
      mid.uniforms.uEnergy.value = wall.uniforms.uEnergy.value;
      mid.uniforms.uGlow.value = glow;
      mid.uniforms.uDetail.value = wall.uniforms.uDetail.value;
      mid.uniforms.uCell.value = wall.uniforms.uCell.value;
    }

    // The far layer is held back against the camera's swing (see
    // ENVIRONMENT.layerParallax), so it moves least and the layers separate.
    const far = farRef.current;
    if (far) {
      const target = interaction.pointerPresent ? interaction.pointer.x * ENVIRONMENT.layerParallax.far : 0;
      far.position.x = damp(far.position.x, target, 2, dt);
    }
    const offsetX = far?.position.x ?? 0;
    // The mid layer is held back less, so it moves a little more than the wall.
    const midGroup = midRef.current;
    if (midGroup) {
      const target = interaction.pointerPresent ? interaction.pointer.x * ENVIRONMENT.layerParallax.mid : 0;
      midGroup.position.x = damp(midGroup.position.x, target, 2, dt);
      if (mid) {
        projectOntoWall(SPATIAL_CORE_POSITION, camera.position, ENVIRONMENT.midground.z, onWall);
        (mid.uniforms.uCore.value as Vector2).set(onWall.x - midGroup.position.x, onWall.y);
      }
    }

    // Wall shader coordinates are the wall's own, so the parallax offset comes off.
    projectOntoWall(SPATIAL_CORE_POSITION, camera.position, ENVIRONMENT.backdrop.z, onWall);
    (wall.uniforms.uCore.value as Vector2).set(onWall.x - offsetX, onWall.y);

    // Where the pointer's line of sight meets the wall: the field bends around it.
    const present = interaction.pointerPresent;
    wall.uniforms.uPointerOn.value = damp(wall.uniforms.uPointerOn.value as number, present ? 1 : 0, 3, dt);
    const hand = signals.handPresent && inputRouter.activeModality() === 'hand';
    wall.uniforms.uHandOn.value = damp(wall.uniforms.uHandOn.value as number, hand ? 1 : 0, 4, dt);
    if (present) {
      pointerRay.set(interaction.pointer.x, interaction.pointer.y, 0.5).unproject(camera).sub(camera.position);
      const k = (ENVIRONMENT.backdrop.z - camera.position.z) / (pointerRay.z || -1e-4);
      (wall.uniforms.uPointer.value as Vector2).set(
        camera.position.x + pointerRay.x * k - offsetX,
        camera.position.y + pointerRay.y * k,
      );
    }

    const ripple = rippleProgress(now);
    const uRipple = wall.uniforms.uRipple.value as Vector3;
    if (ripple) {
      projectOntoWall(ripple, camera.position, ENVIRONMENT.backdrop.z, onWall);
      uRipple.set(onWall.x - offsetX, onWall.y, ripple.t);
    } else {
      uRipple.z = -1;
    }
  });

  return (
    <>
      <color attach="background" args={[PALETTE.base]} />
      {/* Haze pushes the far edge of the space away without fading it out. */}
      <fog attach="fog" args={[PALETTE.haze, ENVIRONMENT.fog.near, ENVIRONMENT.fog.far]} />

      {/* Light is mostly ambient on purpose: it keeps every surface evenly legible
          and leaves shadows as soft weight under an object rather than dark shapes. */}
      <ambientLight intensity={1.68} />
      <directionalLight position={[3.2, 4.8, 8.2]} intensity={0.54} />
      {/* Fill from the opposite side keeps the window edges readable. */}
      <directionalLight position={[-6, 1.2, 3.2]} intensity={0.15} />

      {/* The field, beneath the working volume. */}
      <mesh
        ref={floorRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, ENVIRONMENT.floor.y, ENVIRONMENT.floor.z]}
        material={field}
        renderOrder={-1}
      >
        <planeGeometry args={[ENVIRONMENT.floor.size, ENVIRONMENT.floor.size]} />
      </mesh>

      {/* The far layer — the wall and its living lattice — moves least with the pointer. */}
      <group ref={farRef}>
        <mesh ref={wallRef} position={[0, 0, ENVIRONMENT.backdrop.z]} material={backdrop} renderOrder={-2}>
          <planeGeometry args={[ENVIRONMENT.backdrop.width, ENVIRONMENT.backdrop.height]} />
        </mesh>
      </group>

      {/* The mid layer — haze and the light ribbons — between the wall and the bloom. */}
      <group ref={midRef}>
        <mesh ref={midPlaneRef} position={[0, 0.4, ENVIRONMENT.midground.z]} material={haze} renderOrder={0}>
          <planeGeometry args={[ENVIRONMENT.midground.width, ENVIRONMENT.midground.height]} />
        </mesh>
      </group>

      {/* Rendered once: gives the Core's glass something to reflect. In the dark
          room that is a few thin lights, not a lit studio, so the glass reads as
          dark glass with crisp highlights rather than a grey ball. */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.2} position={[0, 3, 2]} scale={[3, 0.35, 1]} color="#F2EEE6" />
        <Lightformer intensity={0.9} position={[-4, 0.5, 1]} scale={[0.3, 3, 1]} color="#A9BCC4" />
        <Lightformer intensity={0.7} position={[4, -0.5, 1]} scale={[0.3, 2.4, 1]} color="#C9B89E" />
      </Environment>
    </>
  );
}

/** How long the wave a bloom flare sends into the room takes to fade. */
const FLARE_WAVE_MS = 2600;

/** The room's light colours (Phase 11E), as uniforms; one fresh set per material. */
function fieldColours() {
  return {
    uSlate: { value: new Color(PALETTE.slate) },
    uPearl: { value: new Color(PALETTE.pearl) },
    uSilver: { value: new Color(PALETTE.silver) },
    uCyan: { value: new Color(PALETTE.cyan) },
    uViolet: { value: new Color(PALETTE.violet) },
    uWarmWhite: { value: new Color(PALETTE.warmWhite) },
    uAmber: { value: new Color(PALETTE.amber) },
  };
}

/** Reused by the frame loop; never reallocated. */
const onWall = { x: 0, y: 0 };
const pointerRay = new Vector3();
