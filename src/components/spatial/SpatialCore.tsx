import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, ShaderMaterial, Vector3 } from 'three';
import type { Mesh } from 'three';
import { PALETTE } from '../../data/environment';
import {
  CORE_MODE_ENERGY,
  coreMode,
  prefersReducedMotion,
  pulseProgress,
  readAmbientSignals,
} from '../../systems/environment/ambience';
import { microphoneLevel } from '../../systems/voice/microphone';
import { clamp, damp } from '../../utils/math';
import { SPATIAL_CORE_POSITION, spatialCoreLight, spatialCoreScreen } from './spatialCoreState';

/**
 * The NOVA Spatial Core — the bloom (Phase 11C, after the motion reference).
 *
 * The room's one living subject, drawn the way the reference draws its
 * subject: as a dot-matrix lattice of light. An original NOVA form — six
 * petals fanned upward from a warm centre — made entirely of tiny plus-shaped
 * cells whose size and brightness follow the shape underneath. Around it,
 * near-black negative space.
 *
 * It is alive when nothing happens: the petals sway and breathe, the lower
 * half keeps dissolving into dots that fall away into the dark, a few cells
 * twinkle as four-point sparkles, and every few seconds a flare of white light
 * runs along the petal tips and fades.
 *
 * And it is NOVA: it follows the Core's modes and pulses.
 *
 *   idle       slow sway, slow breath, the periodic flare
 *   hand       a little livelier; more sparkles
 *   listening  the petals pulse with the real microphone level; the edges brighten cyan
 *   thinking   faster; the accent rises from the centre into the petals
 *   command    a flare, and a brief cyan-violet pulse
 *   open       a flare and a ring of cyan dots leaving the centre
 *   settle     a soft flare as an answer completes
 *
 * One plane, one shader, no geometry per dot, nothing allocated per frame.
 */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uPetal;
  uniform vec3 uCentre;
  uniform vec3 uAccent;
  uniform vec3 uCyan;
  uniform float uListen;    // 0..1 while NOVA listens: the edges brighten towards cyan
  uniform float uCommand;   // 0..1, a command's brief cyan-violet pulse
  uniform float uTime;
  uniform float uSize;      // the plane's side, in world units
  uniform vec2 uHeart;      // the bloom's centre on the plane, in world units
  uniform float uCell;      // LED cell size, in device pixels
  uniform float uEnergy;    // 0 idle .. 1 thinking
  uniform float uGlow;      // accent share
  uniform float uLevel;     // microphone level
  uniform float uFlare;     // 0..1, a flare along the petal tips
  uniform float uRing;      // an opening's ring of dots, 0..1; < 0 none
  uniform float uScale;     // the bloom's size, in world units per unit of its own form
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  // Smooth value noise: the slow grain that keeps the lattice from reading flat.
  float grain(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // The bloom's light at a point: brightness in x, warmth (heart 0 .. tip 1) in y,
  // tip-ness in z (for the flare).
  vec3 bloom(vec2 L) {
    vec2 d = (L - uHeart) / uScale;
    float t = uTime;
    float breath = 1.0 + 0.035 * sin(t * 0.55) + 0.06 * uLevel;
    float best = 0.0;
    float warmth = 0.0;
    float tipness = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float spread = mix(-1.18, 1.18, fi / 5.0);
      float sway = sin(t * (0.23 + 0.05 * fi) + fi * 1.7) * (0.045 + 0.05 * uEnergy);
      float angle = spread + sway;
      float len = (2.35 + 0.75 * cos(spread * 1.35)) * breath;
      float width = 0.44 + 0.08 * cos(spread * 2.0);
      vec2 p = rot(angle) * d;             // petal frame: y along the petal
      float u = p.y / len;                 // 0 at the heart, 1 at the tip
      if (u < 0.0 || u > 1.05) continue;
      float halfWidth = width * pow(max(sin(3.14159 * clamp(u, 0.0, 1.0)), 0.0), 0.75);
      float across = abs(p.x) / max(halfWidth, 1e-3);
      float inside = 1.0 - smoothstep(0.55, 1.0, across);
      if (inside <= 0.0) continue;
      // Shading: brighter along the midrib and towards the tip; faint veins.
      float midrib = 1.0 - across * 0.55;
      float veins = 0.82 + 0.18 * cos(across * 18.0 - u * 6.0);
      // A lit edge, so each petal reads by its outline against the dark gaps.
      float edge = exp(-pow((across - 0.72) * 7.0, 2.0)) * 0.45;
      float b = inside * (midrib * veins + edge) * (0.42 + 0.58 * smoothstep(0.1, 0.85, u));
      // Petals further out sit a little behind the centre ones.
      b *= 0.78 + 0.22 * cos(spread);
      if (b > best) { best = b; warmth = u; tipness = smoothstep(0.7, 1.0, u) * inside; }
    }
    // The warm heart.
    float heart = exp(-dot(d, d) * 5.0);
    best = max(best, heart * 0.8);
    warmth = mix(warmth, 0.0, heart);
    return vec3(best, warmth, tipness);
  }

  void main() {
    vec2 L = (vUv - 0.5) * uSize;

    // Which LED cell this pixel belongs to, and where that cell's centre is on the plane.
    vec2 frag = gl_FragCoord.xy;
    vec2 cellIndex = floor(frag / uCell);
    vec2 cellCentre = (cellIndex + 0.5) * uCell;
    vec2 Lc = L + dFdx(L) * (cellCentre.x - frag.x) + dFdy(L) * (cellCentre.y - frag.y);

    vec3 b = bloom(Lc);
    // Contrast and grain: most cells sit dim, a few catch the light — the way
    // the reference's lattice reads — and the grain drifts slowly.
    float g = grain(Lc * 1.6 / uScale + vec2(uTime * 0.06, -uTime * 0.04));
    float g2 = grain(Lc * 4.5 / uScale - vec2(uTime * 0.03, 0.0));
    float brightness = pow(b.x, 1.6) * (0.35 + 0.65 * g) * (0.7 + 0.3 * g2) * 0.9;
    // The warm heart holds its light through the grain: the subject's centre.
    vec2 toHeart = (Lc - uHeart) / uScale;
    float heartLight = exp(-dot(toHeart, toHeart) * 7.0);
    brightness = max(brightness, heartLight * (0.5 + 0.5 * g) * (0.75 + 0.25 * g2));
    vec3 tone = mix(uCentre, uPetal, smoothstep(0.05, 0.75, b.y));
    // The heart is not one cream: rose and amber drift through it, as in the reference.
    float drift = grain(Lc * 3.0 / uScale + vec2(uTime * 0.05, uTime * 0.03));
    vec3 warmth = mix(uCentre * vec3(1.0, 0.72, 0.68), uCentre * vec3(1.05, 0.85, 0.5), drift);
    tone = mix(tone, warmth, heartLight * smoothstep(0.35, 0.8, g2) * 0.7);
    // Warm light means the Core: the heart always holds an amber cast (Phase 11E).
    tone = mix(tone, uCentre * vec3(1.08, 0.84, 0.58), heartLight * 0.55);
    // Idle: a very subtle cyan light on the outer petals; listening brightens it.
    tone = mix(tone, uCyan * (1.0 + 0.35 * uListen), smoothstep(0.35, 1.0, b.y) * (0.12 + 0.7 * uListen));
    // Thinking: the accent rises from the heart into the petals.
    tone = mix(tone, uAccent * 1.35, uGlow * (1.0 - smoothstep(0.1, 0.9, b.y)) * 0.85);

    // The dissolve: below the heart, the bloom breaks into dots that fall away.
    vec2 fromHeart = (Lc - uHeart) / uScale;
    if (fromHeart.y < 0.35) {
      float depth = -fromHeart.y + 0.35;
      // Narrower as it falls, thinning with depth, uneven across its width —
      // strands of dots rather than an even snow.
      float column = 1.0 - smoothstep(0.7, 1.6, abs(fromHeart.x) + depth * 0.12);
      float strands = smoothstep(0.35, 0.75, grain(vec2(Lc.x * 1.8 / uScale, uTime * 0.05)));
      float fall = floor(uTime * (2.2 + 1.5 * uEnergy) + hash(vec2(cellIndex.x, 7.0)) * 20.0);
      float speck = step(0.972 - 0.03 * uEnergy, hash(vec2(cellIndex.x, cellIndex.y + fall)));
      float density = exp(-depth * 0.9) * column * (0.35 + 0.65 * strands);
      brightness = max(brightness * smoothstep(0.0, 0.9, 1.0 - depth * 0.55), speck * density * 0.8);
    }

    // An opening's ring of dots, leaving the heart.
    if (uRing >= 0.0) {
      float r = length(fromHeart);
      // A thin ring, and restrained: it crosses the dense heart without filling it.
      float band = exp(-pow((r - uRing * 7.0) * 9.0, 2.0)) * (1.0 - uRing) * (1.0 - uRing);
      brightness = max(brightness, band * 0.45);
      // Cyan: an opening is spatial interaction (violet is kept for intelligence).
      tone = mix(tone, uCyan * 1.2, band);
    }

    // Sparkles: a few cells become four-point stars, twinkling.
    float h = hash(cellIndex);
    float sparkle = step(0.986 - 0.01 * uEnergy, h) * step(0.08, brightness)
      * pow(max(sin(uTime * (0.8 + h * 1.6) + h * 40.0), 0.0), 12.0);

    // The glyph: a plus whose arms grow with brightness; a single pixel when faint.
    vec2 q = frag - cellCentre;
    float thickness = 0.55 * uCell / 6.0 + 0.2;
    float arm = mix(0.6, 0.46 * uCell, clamp(brightness * 1.1, 0.0, 1.0));
    // Coverage, not a step: an arm grows a fraction of a pixel at a time, so
    // bright regions fade into the lattice instead of snapping into a solid grid.
    float plus = max(
      step(abs(q.x), thickness) * clamp(arm + 0.5 - abs(q.y), 0.0, 1.0),
      step(abs(q.y), thickness) * clamp(arm + 0.5 - abs(q.x), 0.0, 1.0)
    );
    // A sparkle's arms reach across neighbouring cells.
    float star = sparkle * max(
      step(abs(q.x), thickness) * (1.0 - smoothstep(0.0, uCell * 1.6, abs(q.y))),
      step(abs(q.y), thickness) * (1.0 - smoothstep(0.0, uCell * 1.6, abs(q.x)))
    );

    float alpha = plus * smoothstep(0.02, 0.2, brightness) * (0.25 + 0.6 * brightness);
    vec3 color = tone * (0.55 + 0.7 * brightness);

    // The flare: the lattice whitens along the petal tips...
    color = mix(color, vec3(1.0), uFlare * b.z * 0.85);
    // A command: a brief pulse of cyan-violet energy through the lattice.
    color = mix(color, mix(uCyan, uAccent * 1.35, 0.5), uCommand * 0.45);
    alpha = max(alpha, star);
    color = mix(color, vec3(1.0), star);

    // ...and each tip throws a glint: a soft halo and a thin four-point star,
    // computed per pixel (not per cell) so the light is smooth, as in the reference.
    float glint = 0.0;
    if (uFlare > 0.001) {
      vec2 at = (L - uHeart) / uScale;
      float breath = 1.0 + 0.035 * sin(uTime * 0.55) + 0.06 * uLevel;
      for (int i = 0; i < 6; i++) {
        float fi = float(i);
        float spread = mix(-1.18, 1.18, fi / 5.0);
        float angle = spread + sin(uTime * (0.23 + 0.05 * fi) + fi * 1.7) * (0.045 + 0.05 * uEnergy);
        float len = (2.35 + 0.75 * cos(spread * 1.35)) * breath * 0.9;
        vec2 tip = vec2(sin(angle), cos(angle)) * len;
        vec2 v = (at - tip) * uScale;
        float strength = uFlare * (0.55 + 0.45 * sin(fi * 2.3 + uTime * 0.7));
        float halo = exp(-dot(v, v) * 11.0);
        float rays = exp(-abs(v.x) * 70.0) * exp(-abs(v.y) * 3.2) + exp(-abs(v.y) * 70.0) * exp(-abs(v.x) * 3.2);
        glint += strength * (halo * 0.42 + rays * 0.45);
      }
    }

    gl_FragColor = vec4(color * alpha + vec3(1.0) * glint, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * The bloom's size and placement. Large, as the reference's subject is large
 * in its frame: at this scale the petals reach out above and between the
 * windows, so the bloom reads as a presence behind them rather than an object
 * hidden by them. The heart sits low on the plane, at the Core.
 */
const SCALE = 2.2;
const PLANE = 19;
const HEART_Y = -4.6;

/** How often the bloom flares by itself, and how long a flare lasts. */
const FLARE_EVERY_S = 7.5;
const FLARE_S = 1.6;

export function SpatialCore() {
  const plane = useRef<Mesh>(null);
  const time = useRef(0);
  const lastNow = useRef(0);
  const energy = useRef(1);
  const glow = useRef(0);
  const listen = useRef(0);
  const level = useRef(0);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uPetal: { value: new Color(PALETTE.petal) },
          uCentre: { value: new Color(PALETTE.bloomCore) },
          uAccent: { value: new Color(PALETTE.accent) },
          uCyan: { value: new Color(PALETTE.cyan) },
          uListen: { value: 0 },
          uCommand: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: PLANE },
          uHeart: { value: [0, HEART_Y] },
          uCell: { value: 6 },
          uEnergy: { value: 0 },
          uGlow: { value: 0 },
          uLevel: { value: 0 },
          uFlare: { value: 0 },
          uRing: { value: -1 },
          uScale: { value: SCALE },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ camera, size, gl }, delta) => {
    const mesh = plane.current;
    if (!mesh) return;
    const u = (mesh.material as ShaderMaterial).uniforms;
    const dt = Math.min(delta, 1 / 30);
    const now = performance.now();
    const still = prefersReducedMotion();
    const elapsed = lastNow.current ? Math.min((now - lastNow.current) / 1000, 1) : 0;
    lastNow.current = now;

    const mode = coreMode(readAmbientSignals(now));
    energy.current = damp(energy.current, CORE_MODE_ENERGY[mode], 2.2, dt);
    const busy = clamp((energy.current - 1) / 2.6, 0, 1);
    time.current += still ? 0 : elapsed * (0.8 + busy * 0.9);
    // Purple means intelligence, so only thinking brings it; listening is cyan.
    glow.current = damp(glow.current, mode === 'thinking' ? 1 : 0, 2.5, dt);
    listen.current = damp(listen.current, mode === 'listening' ? 1 : 0, 3, dt);
    level.current = damp(level.current, mode === 'listening' ? clamp(microphoneLevel() * 2.5, 0, 1) : 0, 8, dt);

    // Flares: by themselves every few seconds, and whenever NOVA acts.
    const t = time.current;
    const phase = (t % FLARE_EVERY_S) / FLARE_S;
    const idleFlare = still ? 0 : phase < 1 ? Math.sin(phase * Math.PI) : 0;
    const command = pulseProgress('command', now);
    const open = pulseProgress('open', now);
    const settle = pulseProgress('settle', now);
    const eventFlare = Math.max(
      command === null ? 0 : Math.sin(command * Math.PI),
      open === null ? 0 : Math.sin(Math.min(open * 2, 1) * Math.PI),
      settle === null ? 0 : Math.sin(settle * Math.PI) * 0.7,
    );

    u.uTime.value = t;
    u.uEnergy.value = busy;
    u.uGlow.value = glow.current;
    u.uListen.value = listen.current;
    u.uCommand.value = command === null ? 0 : Math.sin(command * Math.PI);
    u.uLevel.value = level.current;
    u.uFlare.value = Math.max(idleFlare * 0.8, eventFlare);
    spatialCoreLight.flare = u.uFlare.value as number;
    u.uRing.value = open ?? -1;
    u.uCell.value = 6 * gl.getPixelRatio();

    // Where the Core is on screen, for the caption. Projects a reused vector.
    const p = projected.copy(SPATIAL_CORE_POSITION).project(camera);
    spatialCoreScreen.x = ((p.x + 1) / 2) * size.width;
    spatialCoreScreen.y = ((1 - p.y) / 2) * size.height;
    spatialCoreScreen.radius =
      (1.5 * size.height) / (2 * Math.tan((38 * Math.PI) / 360) * camera.position.distanceTo(SPATIAL_CORE_POSITION));
    spatialCoreScreen.visible = p.z < 1;
    spatialCoreScreen.mode = mode;
  });

  // The plane is centred above the Core so the bloom rises from it.
  return (
    <mesh
      ref={plane}
      position={[SPATIAL_CORE_POSITION.x, SPATIAL_CORE_POSITION.y - HEART_Y, SPATIAL_CORE_POSITION.z]}
      material={material}
      renderOrder={1}
    >
      <planeGeometry args={[PLANE, PLANE]} />
    </mesh>
  );
}

/** Reused by the frame loop; never reallocated. */
const projected = new Vector3();
