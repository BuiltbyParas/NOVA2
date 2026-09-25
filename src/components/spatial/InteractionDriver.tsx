import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { interaction } from '../../systems/interaction/interactionSystem';
import { inputRouter } from '../../systems/input/inputRouter';

/**
 * The single point where input meets the environment.
 *
 * Every frame the interaction system is handed the current viewpoint and asked to
 * resolve whatever the pointer is doing. It is the only component allowed to run
 * that resolution, which is what keeps input handling out of the window components.
 */
export function InteractionDriver() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);

  useEffect(() => {
    inputRouter.setConsumer((frame) => interaction.submit(frame));
  }, []);

  useFrame(() => {
    // The camera has already been moved this frame but its world matrix is only
    // refreshed during the render pass, which runs later. Refreshing it here keeps
    // the ray the user is pointing with aligned with the frame they are looking at —
    // without this, hit-testing trails the picture by a frame while the view settles.
    camera.updateMatrixWorld();
    interaction.update(camera, size);
  });

  return null;
}
