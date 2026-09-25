import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSpatialStore } from '../../state/spatialStore';

/**
 * Keeps NOVA smooth on modest hardware.
 *
 * Softening surfaces by depth is the most expensive thing the interface does, so
 * if the frame rate settles below a usable threshold that effect is dropped.
 * Everything else — the depth model, the interaction — is unaffected, because
 * none of it is decorative.
 */
export function PerformanceGovernor() {
  const samples = useRef<number[]>([]);
  const settledAt = useRef(0);

  useFrame((_, delta) => {
    if (settledAt.current > 1) return;

    const list = samples.current;
    list.push(delta);
    if (list.length < 90) return;

    const average = list.reduce((sum, value) => sum + value, 0) / list.length;
    list.length = 0;
    settledAt.current += 1;

    // Ignore the first window of samples: it includes shader compilation.
    if (settledAt.current < 2) return;

    if (average > 1 / 42) useSpatialStore.getState().setQuality('low');
  });

  return null;
}
