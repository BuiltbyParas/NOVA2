import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, ShaderMaterial, Vector2, Vector3 } from 'three';
import type { Mesh, Points } from 'three';
import { ENVIRONMENT, PALETTE } from '../../data/environment';
import { generateAmbientPoints } from '../../systems/environment/ambientField';
import { ambientTargets, prefersReducedMotion, readAmbientSignals } from '../../systems/environment/ambience';
import { inputRouter } from '../../systems/input/inputRouter';
import { interaction } from '../../systems/interaction/interactionSystem';
import { damp } from '../../utils/math';

/**
 * The room's ambient life, and the field around a tracked hand (Phase 11B).
 *
 * **Points.** A few hundred at most — 150 by default — laid out by a seeded
 * generator behind the working volume. They drift very slowly on the GPU from
 * time alone (no per-point work on the CPU), fade with distance, and a few carry
 * the accent. While NOVA thinks they brighten a little.
 *
 * **Hand field.** With the camera on and a hand in view, a soft ring of light
 * follows the hand, and points near it on screen brighten, grow and part
 * slightly — "NOVA sees me". It reads the existing hand pointer; there is no
 * second tracker.
 */

const POINT_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aSize;
  uniform float uTime;
  uniform vec2 uHand;
  uniform float uHandOn;
  uniform float uWake;
  uniform float uGlow;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vAccent;
  varying float vNear;

  void main() {
    vec3 p = position;
    float s = aSeed * 6.2831853;
    p.x += sin(uTime * 0.035 + s) * 0.55;
    p.y += sin(uTime * 0.052 + s * 1.7) * 0.16;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;
    vec2 ndc = clip.xy / clip.w;

    // The hand's field, in screen space: near points brighten and part.
    vec2 away = ndc - uHand;
    float near = uHandOn * exp(-dot(away, away) * 22.0);
    clip.xy += normalize(away + vec2(1e-4)) * near * 0.035 * clip.w;
    gl_Position = clip;

    float depth = -mv.z;
    gl_PointSize = aSize * uPixelRatio * (1.0 + near * 1.8) * (11.0 / depth);
    vAlpha = (0.34 + 0.55 * near + 0.1 * uWake + 0.12 * uGlow) * smoothstep(27.0, 13.0, depth);
    // Pearl at rest; violet only while NOVA thinks; cyan near a hand (Phase 11E).
    vAccent = step(0.84, fract(aSeed * 13.7)) * uGlow * 0.85;
    vNear = near;
  }
`;

const POINT_FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform vec3 uCyan;
  varying float vAlpha;
  varying float vAccent;
  varying float vNear;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.18, d) * vAlpha;
    if (alpha < 0.004) discard;
    vec3 color = mix(mix(uInk, uCyan, clamp(vNear, 0.0, 1.0)), uAccent * 1.3, clamp(vAccent, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

const FIELD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FIELD_FRAGMENT = /* glsl */ `
  uniform vec3 uAccent;
  uniform vec3 uLight;
  uniform float uOn;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float ring = exp(-pow((d - 0.72) * 11.0, 2.0));
    float inner = exp(-pow((d - 0.42 - 0.04 * sin(uTime * 1.6)) * 16.0, 2.0)) * 0.5;
    float wash = exp(-d * d * 4.0) * 0.18;
    // Added light, not a tint. Cyan: the hand is spatial interaction.
    vec3 color = mix(uLight, uAccent, 0.55);
    gl_FragColor = vec4(color, (ring * 0.5 + inner * 0.3 + wash * 1.2) * uOn * smoothstep(1.0, 0.9, d));
    #include <colorspace_fragment>
  }
`;

/** The plane the hand field is drawn on: the front of the working volume. */
const FIELD_Z = 0.4;

export function AmbientField() {
  const field = useRef<Mesh>(null);
  const cloud = useRef<Points>(null);
  const handOn = useRef(0);
  const pointerInfluence = useRef(0);
  const time = useRef(0);

  const geometry = useMemo(() => {
    const points = generateAmbientPoints(ENVIRONMENT.ambient.count, ENVIRONMENT.ambient.seed);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(points.positions, 3));
    g.setAttribute('aSeed', new BufferAttribute(points.seeds, 1));
    g.setAttribute('aSize', new BufferAttribute(points.sizes, 1));
    return g;
  }, []);

  const pointMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: POINT_VERTEX,
        fragmentShader: POINT_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uHand: { value: new Vector2(0, 0) },
          uHandOn: { value: 0 },
          uWake: { value: 0 },
          uGlow: { value: 0 },
          uPixelRatio: { value: 1 },
          uInk: { value: new Color(PALETTE.pearl) },
          uAccent: { value: new Color(PALETTE.accent) },
          uCyan: { value: new Color(PALETTE.cyan) },
        },
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  const fieldMaterial = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: FIELD_VERTEX,
        fragmentShader: FIELD_FRAGMENT,
        uniforms: {
          uAccent: { value: new Color(PALETTE.cyan) },
          uLight: { value: new Color(PALETTE.light) },
          uOn: { value: 0 },
          uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
      }),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      pointMaterial.dispose();
      fieldMaterial.dispose();
    },
    [geometry, pointMaterial, fieldMaterial],
  );

  useFrame(({ camera, gl }, delta) => {
    const dt = Math.min(delta, 1 / 30);
    time.current += prefersReducedMotion() ? 0 : dt;

    const signals = readAmbientSignals();
    const targets = ambientTargets(signals);
    const hand = signals.handPresent && inputRouter.activeModality() === 'hand';
    handOn.current = damp(handOn.current, hand ? 1 : 0, 5, dt);
    // The mouse bends nearby points too, but far more gently than a hand; the
    // ring of light is the hand's alone.
    const pointerOn = hand ? handOn.current : interaction.pointerPresent ? 0.35 : 0;
    pointerInfluence.current = damp(pointerInfluence.current, pointerOn, 4, dt);

    const points = cloud.current?.material as ShaderMaterial | undefined;
    const mesh = field.current;
    if (!points || !mesh) return;
    const u = points.uniforms;
    u.uTime.value = time.current;
    u.uWake.value = damp(u.uWake.value as number, targets.wake, 2.4, dt);
    u.uGlow.value = damp(u.uGlow.value as number, targets.glow, 3, dt);
    u.uPixelRatio.value = gl.getPixelRatio();
    u.uHandOn.value = pointerInfluence.current;
    (u.uHand.value as Vector2).copy(interaction.pointer);

    mesh.visible = handOn.current > 0.01;
    if (mesh.visible) {
      // Where the hand's ray crosses the front of the working volume.
      ray.set(interaction.pointer.x, interaction.pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
      const k = (FIELD_Z - camera.position.z) / (ray.z || -1e-4);
      mesh.position.copy(camera.position).addScaledVector(ray, k);
      mesh.quaternion.copy(camera.quaternion);
    }
    const f = (mesh.material as ShaderMaterial).uniforms;
    f.uOn.value = handOn.current;
    f.uTime.value = time.current;
  });

  return (
    <>
      <points ref={cloud} geometry={geometry} material={pointMaterial} frustumCulled={false} renderOrder={0} />
      <mesh ref={field} material={fieldMaterial} visible={false} renderOrder={5}>
        <planeGeometry args={[0.6, 0.6]} />
      </mesh>
    </>
  );
}

/** Reused by the frame loop; never reallocated. */
const ray = new Vector3();
