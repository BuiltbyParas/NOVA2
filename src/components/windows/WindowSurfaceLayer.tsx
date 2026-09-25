import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { subscribeToSurfaces, surfaceSnapshot } from './surfaceRegistry';
import { WindowSurface } from './WindowSurface';

/**
 * Renders every window's face into the element that window owns inside the scene.
 *
 * Lives outside the canvas so these are plain React DOM nodes, while the elements
 * themselves are positioned in 3D by the CSS3D pass.
 */
export function WindowSurfaceLayer() {
  const surfaces = useSyncExternalStore(subscribeToSurfaces, surfaceSnapshot, surfaceSnapshot);

  return (
    <>
      {surfaces.map((surface) =>
        createPortal(
          <WindowSurface id={surface.id} app={surface.app} title={surface.title} />,
          surface.element,
          surface.id,
        ),
      )}
    </>
  );
}
