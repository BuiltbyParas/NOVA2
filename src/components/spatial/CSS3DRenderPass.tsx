import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

/**
 * DOM surfaces inside the 3D scene.
 *
 * Window content is real DOM rather than a texture: text stays crisp at any depth
 * and costs almost nothing to draw, which matters on integrated graphics. A second
 * CSS3D pass renders those elements with the same camera as the WebGL pass, so a
 * window's surface and its physical slab share one transform hierarchy.
 */

/**
 * Drives both render passes.
 *
 * Registering a frame callback above priority 0 hands rendering to us, so this
 * component is responsible for drawing the WebGL scene as well as the DOM layer.
 * Everything else in the scene must stay at the default priority.
 */
export function CSS3DRenderPass() {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const renderer = useMemo(() => new CSS3DRenderer(), []);

  useEffect(() => {
    const element = renderer.domElement;
    element.style.position = 'absolute';
    element.style.inset = '0';
    element.style.pointerEvents = 'none';
    // Sits above the WebGL canvas; the scene is composed so the Core is never
    // hidden behind a surface.
    element.style.zIndex = '1';
    const host = gl.domElement.parentElement;
    host?.appendChild(element);
    return () => {
      element.remove();
    };
  }, [gl, renderer]);

  useEffect(() => {
    renderer.setSize(size.width, size.height);
  }, [renderer, size.width, size.height]);

  useFrame((state) => {
    state.gl.render(state.scene, state.camera);
    renderer.render(state.scene, state.camera);
  }, 1);

  return null;
}
