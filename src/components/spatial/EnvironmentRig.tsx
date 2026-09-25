import { useEffect, useMemo } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { ENVIRONMENT } from '../../data/environment';
import {
  createBackdropTexture,
  createFieldFadeTexture,
  createFieldTexture,
} from '../../utils/textures';

/**
 * The room.
 *
 * NOVA's environment is light, and a light environment is the harder one to
 * make read as a space: there is no darkness for objects to emerge from, so
 * every depth cue has to be earned. Three do the work here, and none of them
 * costs a render pass.
 *
 *   **The field.** A grid on the floor, fading out before its own edge.
 *   Perspective converges it, and convergence is the cue that says "this
 *   continues away from you" more cheaply than any amount of lighting.
 *
 *   **The haze.** Fog, tuned to lift the far wall away rather than to fade it
 *   out, so the back of the room is further rather than paler.
 *
 *   **The light.** Mostly ambient, with a single soft key. Shadows are weight
 *   an object carries under itself, never dark shapes on a wall — which is the
 *   treatment that keeps a bright room from looking like a rendering test.
 */
export function EnvironmentRig() {
  const backdrop = useMemo(() => createBackdropTexture(), []);
  const field = useMemo(() => createFieldTexture(), []);
  const fieldFade = useMemo(() => createFieldFadeTexture(), []);

  // Procedural textures are generated once, and are this component's to release.
  useEffect(
    () => () => {
      backdrop.dispose();
      field.dispose();
      fieldFade.dispose();
    },
    [backdrop, field, fieldFade],
  );

  return (
    <>
      <color attach="background" args={['#F4F4F1']} />
      {/* Haze pushes the far edge of the space away without fading it out. */}
      <fog attach="fog" args={['#F1F1EE', 11, 27]} />

      {/* Light is mostly ambient on purpose: it keeps every surface evenly legible
          and leaves shadows as soft weight under an object rather than dark shapes. */}
      <ambientLight intensity={1.68} />
      <directionalLight position={[3.2, 4.8, 8.2]} intensity={0.54} />
      {/* Fill from the opposite side keeps the window edges readable. */}
      <directionalLight position={[-6, 1.2, 3.2]} intensity={0.15} />

      {/* The field. Laid flat beneath the working volume and masked to a soft
          circle, so it has no visible edge to give the illusion away. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.15, -1.2]}>
        <planeGeometry args={[46, 46]} />
        <meshBasicMaterial
          map={field}
          alphaMap={fieldFade}
          transparent
          opacity={0.72}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0, ENVIRONMENT.backdrop.z]}>
        <planeGeometry args={[ENVIRONMENT.backdrop.width, ENVIRONMENT.backdrop.height]} />
        <meshStandardMaterial map={backdrop} roughness={1} metalness={0} envMapIntensity={0.15} />
      </mesh>

      {/* Rendered once: gives the Core's glass something to reflect. */}
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={1.6} position={[0, 3, 2]} scale={[6, 3, 1]} color="#ffffff" />
        <Lightformer intensity={0.8} position={[-4, 0, 1]} scale={[3, 4, 1]} color="#EDEDF6" />
        <Lightformer intensity={0.5} position={[4, -1, 1]} scale={[3, 3, 1]} color="#F6F2EC" />
        <Lightformer intensity={0.35} position={[0, -3, -2]} scale={[6, 2, 1]} color="#DFE0E6" />
      </Environment>
    </>
  );
}
