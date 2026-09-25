import { useEffect, useMemo, useState } from 'react';
import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { PIXELS_PER_UNIT } from '../../data/environment';

/**
 * Creates a DOM element bound to a scene object.
 *
 * The element is authored at `PIXELS_PER_UNIT` density and scaled down into world
 * units, so one CSS pixel is a fixed fraction of a spatial unit everywhere.
 */
export function useSurfaceObject(widthUnits: number, heightUnits: number) {
  const [element] = useState(() => {
    const node = document.createElement('div');
    node.style.pointerEvents = 'none';
    return node;
  });

  const object = useMemo(() => {
    const css = new CSS3DObject(element);
    css.scale.setScalar(1 / PIXELS_PER_UNIT);
    return css;
  }, [element]);

  const widthPx = Math.round(widthUnits * PIXELS_PER_UNIT);
  const heightPx = Math.round(heightUnits * PIXELS_PER_UNIT);

  useEffect(() => {
    element.style.width = `${widthPx}px`;
    element.style.height = `${heightPx}px`;
    element.style.pointerEvents = 'none';
  }, [element, widthPx, heightPx]);

  useEffect(() => () => object.element.remove(), [object]);

  return { element, object, widthPx, heightPx };
}
