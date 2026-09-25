import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { NoToneMapping } from 'three';
import { ENVIRONMENT } from '../../data/environment';
import { useSpatialStore } from '../../state/spatialStore';
import { inputRouter } from '../../systems/input/inputRouter';
import { createMouseInputSource } from '../../systems/input/mouseInputSource';
import { SpatialWindowView } from '../windows/SpatialWindowView';
import { NovaCore } from '../core/NovaCore';
import { CameraRig } from './CameraRig';
import { EnvironmentRig } from './EnvironmentRig';
import { InteractionDriver } from './InteractionDriver';
import { PerformanceGovernor } from './PerformanceGovernor';
import { CSS3DRenderPass } from './CSS3DRenderPass';

function WindowLayer() {
  // Only the set of ids re-renders here; everything about a window's transform
  // is read in the frame loop instead.
  const ids = useSpatialStore((state) => state.order);
  return (
    <>
      {ids.map((id) => (
        <SpatialWindowView key={id} id={id} />
      ))}
    </>
  );
}

export function SpatialScene() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Phase 1's only input source. Hand tracking registers here alongside it.
    const mouse = createMouseInputSource(stage);
    inputRouter.register(mouse);
    return () => inputRouter.unregister(mouse.id);
  }, []);

  return (
    <div className="nova-stage" ref={stageRef}>
      <Canvas
        // No shadow pass: nothing in this space is close enough behind an object to
        // catch a cast shadow, so depth is carried by perspective, haze and the soft
        // weight each surface holds beneath itself. It also frees a whole pass.
        shadows={false}
        dpr={[1, 1.75]}
        // NOVA's palette is authored in sRGB and the environment is a light room:
        // filmic tone mapping would grey it out, so the renderer stays linear.
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
        camera={{
          position: [...ENVIRONMENT.camera.position],
          fov: ENVIRONMENT.camera.fov,
          near: ENVIRONMENT.camera.near,
          far: ENVIRONMENT.camera.far,
        }}
      >
        <EnvironmentRig />
        <CameraRig />
        <NovaCore />
        <WindowLayer />
        <InteractionDriver />
        <PerformanceGovernor />
        {/* Must be last: it owns both render passes. */}
        <CSS3DRenderPass />
      </Canvas>
    </div>
  );
}
