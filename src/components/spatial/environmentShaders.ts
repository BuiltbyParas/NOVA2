/**
 * The room's procedural surfaces (Phase 11; recomposed in 11B; redrawn in 11C
 * as a dot-matrix room after the motion reference; coloured in 11D; relit in 11E
 * as a room lit by meaningful light).
 *
 * All are single-pass fragment shaders with no texture reads: a handful of
 * smooth curves per pixel, no post-processing. Everything is laid out in world
 * units around the NOVA Spatial Core, so the wall's arcs, the floor's rings and
 * the Core read as one composition.
 *
 * Colours arrive as uniforms from `PALETTE` (converted to linear by three.js)
 * and leave through `colorspace_fragment`, so they match the CSS tokens exactly.
 */

const COMMON = /* glsl */ `
  // A quarter of a code value of noise: enough to break banding in long, soft
  // gradients on an 8-bit display, far too little to see as grain.
  float nova_dither(vec2 frag) {
    return (fract(sin(dot(frag, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  }

  // An anti-aliased line of roughly constant screen width.
  float nova_line(float distance, float pixels) {
    return 1.0 - smoothstep(0.0, fwidth(distance) * pixels, abs(distance));
  }
`;

/**
 * 2D simplex noise (Ashima Arts / Stefan Gustavson, MIT) and a fractal sum.
 * The basis of the motion field: smooth, non-repeating, cheap per pixel.
 */
const NOISE = /* glsl */ `
  vec3 nova_permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

  float nova_snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = nova_permute(nova_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Fractal sum; 'detail' drops the finest octaves on modest hardware.
  float nova_fbm(vec2 p, float detail) {
    float sum = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 4; i++) {
      if (float(i) > 1.0 + detail * 2.0) break;
      sum += nova_snoise(p) * amplitude;
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      amplitude *= 0.5;
    }
    return sum;
  }
`;

export const BACKDROP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The far wall (Phase 11E): a lit room, not a painted background.
 *
 * The wall is a darkened physical space — deep blue-grey falling to graphite —
 * and everything on it is light acting on that space:
 *
 *   **Atmosphere.** The Phase 11D flow remains, but it now moves *slate light*
 *   through the air, low in contrast, so the room is never still and never
 *   coloured by it.
 *
 *   **Architectural light.** A few enormous, smooth falloffs, as from lights
 *   out of view: a cool pearl key from high on the left, a faint blue from
 *   above, and warm white from the NOVA Core, spilling into the room around it.
 *
 *   **The horizon.** A soft band of light and haze where the floor meets the
 *   wall, so the room reads as enormous; below it the ground reflects the wall.
 *
 *   **Scale.** Two distant structures, barely there: a giant arc around the
 *   Core and a tall frame either side, drawn in pearl, partly as LED dots, with
 *   light travelling slowly along them.
 *
 * Colour means something here. Warm is the Core. Violet appears only while
 * NOVA thinks (the Core's light turns violet and streams leave it). Cyan is
 * spatial interaction and stays local: the pointer, the hand, a command's
 * ripple, an opening's wave. The bloom's flare sends a wave of warm light out.
 */
export const BACKDROP_FRAGMENT = /* glsl */ `
  uniform vec3 uWallHigh;
  uniform vec3 uWallLow;
  uniform vec3 uFloorFar;
  uniform vec3 uFloorNear;
  uniform vec3 uAccent;
  uniform vec3 uLight;
  uniform vec3 uSlate;
  uniform vec3 uPearl;
  uniform vec3 uSilver;
  uniform vec3 uCyan;
  uniform vec3 uViolet;
  uniform vec3 uWarmWhite;
  uniform vec3 uAmber;
  uniform float uGlow;
  uniform float uWake;
  uniform float uTime;
  uniform float uFlowTime;
  uniform float uEnergy;
  uniform float uLevel;
  uniform float uDetail;
  uniform vec2 uPointer;
  uniform float uPointerOn;
  uniform float uHandOn;    // 0..1, a tracked hand is driving the pointer
  uniform float uWave;      // an opening's wave, 0..1; < 0 none
  uniform float uCommand;   // a command's ripple, 0..1; < 0 none
  uniform float uFlareWave; // the bloom's flare spreading outward, 0..1; < 0 none
  uniform vec2 uSize;
  uniform float uFloorY;
  uniform vec2 uCore;
  uniform vec3 uRipple;
  uniform float uCell;
  varying vec2 vUv;
  ${COMMON}
  ${NOISE}

  float ring(float r, float radius, float width) {
    float x = (r - radius) / width;
    return exp(-x * x);
  }

  void main() {
    vec2 world = vec2((vUv.x - 0.5) * uSize.x, (vUv.y - 0.5) * uSize.y);
    float above = world.y - uFloorY;
    float ground = 1.0 - smoothstep(-0.05, 0.05, above);
    // Below the horizon, the ground reflects the wall above it, squashed.
    vec2 fw = vec2(world.x, above < 0.0 ? uFloorY - above * 1.8 : world.y);

    vec3 night = mix(mix(uFloorFar, uFloorNear, smoothstep(0.0, 3.4, -above)),
                     mix(uWallLow, uWallHigh, smoothstep(0.0, 8.0, above)),
                     1.0 - ground);

    // ---- Atmosphere: slate light moving through the air ------------------------
    float t = uFlowTime;
    float ft = t * (0.025 + 0.045 * uEnergy + 0.03 * uLevel);
    vec2 p = vec2(fw.x / 26.0, fw.y / 14.0);
    vec2 wc = fw - uCore;
    float rc = length(wc);
    vec2 outward = wc / max(rc, 1e-3);
    float emitted = sin(rc * 1.1 - t * (0.4 + 0.6 * uEnergy)) * exp(-rc * 0.14) * (0.08 + 0.3 * uLevel + 0.18 * uEnergy);
    // Two octaves for the air itself (smooth, and cheap).
    float soft = 0.0;
    vec2 q = vec2(nova_fbm(p + vec2(0.0, ft), soft), nova_fbm(p + vec2(5.2, -ft * 0.8) + 1.3, soft));
    float f = nova_fbm(p + 1.6 * q + emitted * outward + vec2(ft * 0.6, -ft * 0.35), soft + uDetail * 0.5);
    float air = smoothstep(-0.6, 0.9, f);
    float crest = smoothstep(0.4, 0.95, f);

    vec3 color = night;
    color += uSlate * (0.08 + 0.3 * air);

    // ---- Architectural light: huge, smooth, from out of view --------------------
    vec2 keyAt = vec2(-10.0 + 1.6 * sin(t * 0.018), 8.0 + 0.8 * sin(t * 0.013));
    vec2 k = (fw - keyAt) / vec2(15.0, 11.0);
    float key = exp(-dot(k, k));
    color += mix(uPearl, uCyan, 0.18) * key * (0.035 + 0.02 * air);
    // A faint blue from above.
    color += uSlate * smoothstep(0.5, 8.0, fw.y) * 0.22;
    // The Core's warm light, spilling into the room; violet while NOVA thinks.
    float breath = 1.0 + 0.06 * sin(t * 0.33) + 0.12 * uLevel;
    float spread = rc / (6.5 + 0.6 * (f - 0.1));
    float coreLight = exp(-spread * spread) * breath;
    vec3 warm = mix(uWarmWhite, uAmber, 0.6 + 0.15 * q.y);
    warm = mix(warm, uViolet, uGlow * 0.85);
    color += warm * coreLight * (0.09 + 0.035 * uEnergy);
    color += warm * exp(-rc * rc / 4.0) * 0.08;

    // Thinking: streams of violet travel out from the Core.
    float stream = pow(0.5 + 0.5 * sin(rc * 1.3 - t * 1.6 + f * 3.0), 5.0) * exp(-rc * 0.16);
    color += uViolet * stream * uGlow * 0.14;

    // ---- The horizon ------------------------------------------------------------
    float horizon = exp(-abs(above) * 0.8);
    color += mix(uSlate, uPearl, 0.12) * horizon * 0.22;
    color += uPearl * exp(-abs(above) * 7.0) * 0.012;

    // ---- Scale: distant structures ----------------------------------------------
    // A giant arc around the Core, and a tall frame either side, far away.
    float arcD = abs(rc - 9.2);
    float along = 0.5 + 0.5 * sin(atan(wc.y, wc.x) * 1.5 - t * 0.05);
    float arc = nova_line(arcD, 1.4) * (1.0 - ground) * smoothstep(-1.0, 1.5, wc.y);
    float frameX = abs(abs(fw.x - uCore.x) - 7.6);
    float frameY = fw.y - uFloorY;
    float frame = nova_line(frameX, 1.2) * step(0.0, frameY) * (1.0 - smoothstep(6.0, 9.0, frameY)) * (1.0 - ground);
    float travelUp = 0.5 + 0.5 * sin(frameY * 0.5 - t * 0.12);
    color += uPearl * (arc * (0.018 + 0.03 * along) + frame * (0.03 + 0.035 * travelUp));

    // ---- Events -----------------------------------------------------------------
    float event = 0.0;
    vec3 eventColor = vec3(0.0);
    // The bloom's flare: a wave of warm light into the space around it.
    if (uFlareWave >= 0.0) {
      float a = ring(rc, 1.0 + uFlareWave * 7.0, 0.9 + uFlareWave * 1.2) * (1.0 - uFlareWave) * (1.0 - uFlareWave);
      eventColor += mix(uWarmWhite, uAmber, 0.3) * a * 0.12;
      event += a * 0.5;
    }
    // A command: a brief cyan-to-violet ripple.
    if (uCommand >= 0.0) {
      float a = ring(rc, 0.8 + uCommand * 7.5, 0.5 + uCommand * 0.8) * (1.0 - uCommand);
      eventColor += mix(uCyan, uViolet, uCommand) * a * 0.22;
      event += a;
    }
    // An application opening: a restrained cyan wave across the room — a thin
    // travelling ring, never a filled disc of light.
    if (uWave >= 0.0) {
      float a = ring(rc, uWave * 16.0, 0.3 + uWave * 0.7) * (1.0 - uWave) * (1.0 - uWave);
      eventColor += mix(uCyan, uPearl, 0.35) * a * 0.2;
      event += a * 0.8;
    }
    // The window that opened sends its own ring of light.
    if (uRipple.z >= 0.0) {
      float r0 = uRipple.z;
      float a = ring(length(fw - uRipple.xy), 0.6 + r0 * 8.0, 0.45) * (1.0 - r0) * (1.0 - r0);
      eventColor += uCyan * a * 0.2;
      event += a;
    }
    color += eventColor;

    // ---- Pointer and hand: cyan, local --------------------------------------------
    vec2 toPointer = world - uPointer;
    float nearMouse = exp(-dot(toPointer, toPointer) / 5.0) * uPointerOn * (1.0 - uHandOn);
    float nearHand = exp(-dot(toPointer, toPointer) / 8.0) * uHandOn;
    color += mix(uPearl, uCyan, 0.5) * nearMouse * 0.025 + uCyan * nearHand * 0.1;

    // ---- The ground ---------------------------------------------------------------
    float reflection = mix(0.7, 0.2, smoothstep(0.0, 3.6, -above));
    color = mix(color, night + (color - night) * reflection, 1.0 - smoothstep(-0.8, 0.0, above));

    // ---- The lattice --------------------------------------------------------------
    // The LED cells remain, in pearl: the air's brightest folds, the distant
    // structures, and any event, shown as dots.
    vec2 frag = gl_FragCoord.xy;
    vec2 centreCell = (floor(frag / uCell) + 0.5) * uCell;
    vec2 d = frag - centreCell;
    float dotShape = step(abs(d.x), 0.75) * step(abs(d.y), 0.75);
    float structure = exp(-arcD * arcD * 3.0) * along * (1.0 - ground) * smoothstep(-1.0, 1.5, wc.y);
    float lit = crest * 0.5 + structure * 0.8 + nearMouse * 0.5 + nearHand + event * 1.4 + stream * uGlow;
    lit *= (1.0 - smoothstep(0.6, 1.3, length(vec2(world.x / 12.0, (world.y - 0.5) / 6.5)))) * (1.0 - ground * 0.6);
    vec3 dotColor = uSilver * 0.09 + eventColor * 1.5 + uCyan * nearHand * 0.15 + uViolet * stream * uGlow * 0.12;
    color += dotColor * dotShape * lit;

    // Atmosphere: the room deepens towards the ceiling and its far edges, never to black.
    color = night + (color - night) * (1.0 - smoothstep(3.0, 8.0, world.y) * 0.35);
    vec2 e = vec2(world.x / 10.5, (world.y - 0.6) / 6.0);
    color *= 1.0 - smoothstep(0.55, 1.4, length(e)) * 0.3;

    gl_FragColor = vec4(color + nova_dither(gl_FragCoord.xy), 1.0);
    #include <colorspace_fragment>
  }
`;

export const FLOOR_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * The floor (Phase 11C; relit in 11E): a spatial surface of points.
 *
 * A world-space lattice of dim pearl points fading into distance, with dotted
 * rings around the point beneath the bloom. The Core's warm light reflects in a
 * pool beneath it, so Core and floor are one light. Colour stays meaningful: a
 * hand in view firms the rings and cools them towards cyan; NOVA thinking tints
 * them violet; an opening sends a cyan wave outward.
 */
export const FLOOR_FRAGMENT = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform vec3 uLight;
  uniform vec3 uPearl;
  uniform vec3 uCyan;
  uniform vec3 uViolet;
  uniform vec3 uWarmWhite;
  uniform vec3 uAmber;
  uniform vec2 uStage;
  uniform float uWake;
  uniform float uGlow;
  uniform float uTime;
  uniform float uPulse;
  uniform float uOffset;   // sideways drift during a layer transition (Phase 13)
  varying vec3 vWorld;
  ${COMMON}

  void main() {
    vec2 xz = vWorld.xz - vec2(uOffset, 0.0);
    vec2 d = xz - uStage;
    float r = length(d);
    float fade = (1.0 - smoothstep(4.0, 17.0, r));

    // Distance, in pixels, to the nearest lattice point.
    float spacing = 0.46;
    vec2 g = (fract(xz / spacing + 0.5) - 0.5) * spacing;
    vec2 px = g / max(fwidth(xz), vec2(1e-4));
    float point = 1.0 - smoothstep(0.6, 1.3, length(px));

    // Dotted rings: points near a ring radius are brighter.
    float ringBoost = exp(-pow((r - 1.5) * 5.0, 2.0)) * 1.0
                    + exp(-pow((r - 2.9) * 5.0, 2.0)) * 0.8
                    + exp(-pow((r - 4.8) * 5.0, 2.0)) * 0.6;
    float brightness = (0.14 + ringBoost * 0.45) * (1.0 + 0.5 * uWake);
    // The Core's warm light, reflected beneath it, breathing with it.
    float pool = exp(-pow(r / 3.2, 2.0)) * (0.4 + 0.04 * sin(uTime * 0.33));
    brightness += pool;

    vec3 color = mix(uPearl, mix(uWarmWhite, uAmber, 0.35), smoothstep(0.08, 0.35, pool));
    color = mix(color, uCyan, ringBoost * uWake * 0.45);
    color = mix(color, uViolet * 1.2, clamp((ringBoost + pool) * uGlow * 0.8, 0.0, 0.8));

    float wave = 0.0;
    if (uPulse >= 0.0) wave = exp(-pow((r - (0.4 + uPulse * 11.0)) * 1.8, 2.0)) * (1.0 - uPulse) * 1.2;
    color = mix(color, mix(uCyan, uPearl, 0.3), clamp(wave, 0.0, 0.9));
    float alpha = point * (brightness + wave) * fade * 0.55;

    gl_FragColor = vec4(color, clamp(alpha + nova_dither(gl_FragCoord.xy), 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export const MIDGROUND_VERTEX = BACKDROP_VERTEX;

/**
 * The mid layer (Phase 11D; made architectural in 11E), between the wall and the bloom.
 *
 * A second, transparent plane nearer than the wall, with its own parallax and
 * faster time, so the room has depth rather than being a backdrop:
 *
 *   **Air.** A faint slate haze drifting faster than the wall's atmosphere.
 *
 *   **Streams of light.** Three large streams crossing the room behind the
 *   applications, drawn in NOVA's dot-matrix language — pearl and cyan-white LED
 *   cells along a soft band that sweeps on a long arc, narrowing where it turns,
 *   with pulses of light travelling along it, fading into the distance at its
 *   ends. Violet only while NOVA thinks.
 *
 *   **The orbit.** One enormous ring of light lying around the Core, seen in
 *   perspective — a translucent spatial form that says "this is a room" — with
 *   light travelling slowly round it, brighter on its near side.
 *
 * Added light only (additive blending), so it lifts the room and never darkens
 * anything.
 */
export const MIDGROUND_FRAGMENT = /* glsl */ `
  uniform vec3 uSlate;
  uniform vec3 uPearl;
  uniform vec3 uSilver;
  uniform vec3 uCyan;
  uniform vec3 uViolet;
  uniform vec3 uWarmWhite;
  uniform vec3 uAccent;
  uniform vec2 uSize;
  uniform vec2 uCore;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uGlow;
  uniform float uDetail;
  uniform float uCell;
  varying vec2 vUv;
  ${COMMON}
  ${NOISE}

  // A stream at a point: its soft body in x, its bright spine in y. Each sweeps
  // across the room on a long diagonal arc and narrows where it turns, like silk.
  vec2 ribbon(vec2 w, float fi, float t) {
    float x = w.x;
    float baseY = mix(3.2, -0.6, fi / 2.0) + 0.4 * sin(t * 0.02 + fi);
    float slope = mix(-0.16, 0.2, fi / 2.0);
    float yc = baseY + slope * x
      + 1.9 * sin(x * 0.095 + t * (0.035 + 0.01 * fi) + fi * 2.1)
      + 0.5 * sin(x * 0.27 - t * 0.05 + fi * 4.0)
      + 0.4 * nova_snoise(vec2(x * 0.06 + fi * 7.3, t * 0.018));
    float turn = 0.5 + 0.5 * sin(x * 0.16 + t * 0.04 + fi * 1.7);
    float width = 0.35 + 1.3 * turn;
    float dy = w.y - yc;
    float span = fi * 3.0 - 3.0;
    float taper = smoothstep(-19.0, -8.0, x - span) * (1.0 - smoothstep(7.0, 18.0, x - span));
    float body = exp(-dy * dy / (width * width));
    float spineWidth = 0.06 + 0.12 * turn;
    float spine = exp(-dy * dy / (spineWidth * spineWidth)) * (1.2 - turn * 0.6);
    return vec2(body, spine) * taper;
  }

  void main() {
    vec2 w = vec2((vUv.x - 0.5) * uSize.x, (vUv.y - 0.5) * uSize.y);
    float t = uTime * (1.0 + 0.8 * uEnergy);
    vec3 color = vec3(0.0);

    // Air: a slate haze drifting faster than the wall behind. One octave: felt, not seen.
    vec2 hp = vec2(w.x / 20.0 + t * 0.012, w.y / 10.0 - t * 0.006);
    float h = nova_snoise(hp);
    color += uSlate * smoothstep(-0.1, 0.8, h) * 0.12;

    vec2 frag = gl_FragCoord.xy;
    vec2 cellCentre = (floor(frag / uCell) + 0.5) * uCell;
    vec2 qd = frag - cellCentre;
    float cellHash = fract(sin(dot(floor(frag / uCell), vec2(12.9898, 78.233))) * 43758.5453);
    float thickness = 0.55 * uCell / 6.0 + 0.2;

    // Streams of light — pearl and cyan-white; violet only while NOVA thinks.
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      // Cheap bound first: most of the plane is nowhere near a given stream.
      float band = w.y - (mix(3.2, -0.6, fi / 2.0) + mix(-0.16, 0.2, fi / 2.0) * w.x);
      if (abs(band) > 4.8) continue;
      vec2 glow = ribbon(w, fi, t);
      // Pulses travel along each stream; a few cells are always dark, so it flows.
      float travel = pow(0.5 + 0.5 * sin(w.x * 0.45 - t * (0.5 + 0.4 * uEnergy) + fi * 2.3), 3.0);
      float b = glow.y * (0.25 + 0.75 * travel) * step(0.45, cellHash);
      float arm = mix(0.6, 0.42 * uCell, clamp(b * 1.3, 0.0, 1.0));
      float plus = max(
        step(abs(qd.x), thickness) * clamp(arm + 0.5 - abs(qd.y), 0.0, 1.0),
        step(abs(qd.y), thickness) * clamp(arm + 0.5 - abs(qd.x), 0.0, 1.0)
      ) * smoothstep(0.04, 0.2, b);
      // Nearer streams brighter; each fades into the distance towards its ends.
      float depth = mix(0.6, 1.0, fi / 2.0) * (0.4 + 0.6 * smoothstep(12.0, 3.0, abs(w.x - (fi * 3.0 - 3.0))));
      vec3 c = mix(uPearl, uCyan, 0.25 + 0.2 * sin(w.x * 0.08 + t * 0.03 + fi));
      c = mix(c, uViolet * 1.2, uGlow * 0.7);
      color += c * (glow.x * 0.018 + glow.y * 0.03) * depth * (1.0 + 0.7 * uEnergy);
      color += c * plus * (0.3 + 0.7 * b) * depth * (0.32 + 0.25 * uEnergy);
    }

    // The orbit: one enormous ring lying around the Core, in perspective.
    vec2 o = (w - uCore - vec2(0.0, -0.4)) / vec2(8.8, 1.7);
    float orbitR = length(o);
    float angle = atan(o.y, o.x);
    float nearSide = 0.35 + 0.65 * smoothstep(0.4, -0.8, o.y);    // the side nearer the viewer is brighter
    float travelling = pow(0.5 + 0.5 * cos(angle + t * 0.06), 4.0);
    float orbitLine = exp(-pow((orbitR - 1.0) * 26.0, 2.0));
    float orbitGlow = exp(-pow((orbitR - 1.0) * 6.0, 2.0));
    vec3 orbitColor = mix(uPearl, uWarmWhite, 0.25);
    orbitColor = mix(orbitColor, uViolet * 1.2, uGlow * 0.6);
    color += orbitColor * (orbitLine * (0.035 + 0.1 * travelling) + orbitGlow * 0.01) * nearSide;

    // Keep the bloom clear: the mid layer thins in front of the Core.
    vec2 toCore = (w - uCore) / vec2(4.0, 3.2);
    color *= 0.45 + 0.55 * smoothstep(0.3, 1.2, length(toCore));
    // And fades out towards its own edges, so it has none.
    color *= 1.0 - smoothstep(0.7, 1.0, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;
