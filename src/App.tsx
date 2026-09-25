import { SpatialScene } from './components/spatial/SpatialScene';
import { WindowSurfaceLayer } from './components/windows/WindowSurfaceLayer';
import { SpatialCursor } from './components/interface/SpatialCursor';
import { WorkspaceRail } from './components/interface/WorkspaceRail';
import { CommandLine } from './components/interface/CommandLine';
import { SystemLayer } from './components/interface/SystemLayer';
import { HandInputDriver } from './components/spatial/HandInputDriver';
import { VisionDebugPanel } from './components/debug/VisionDebugPanel';
import { ContextInspector } from './components/debug/ContextInspector';
import { useKeyboardCommands } from './systems/input/keyboardCommands';
import { useContextEngine } from './systems/context/useContextEngine';
import { useMemory } from './systems/memory/useMemory';
import { useMultimodalContext } from './systems/multimodal/multimodalDriver';
import { useNativeAwareness } from './systems/native/useNativeAwareness';
import { useSpatialStore } from './state/spatialStore';

/**
 * NOVA.
 *
 * The spatial environment fills the screen; everything else is a thin layer of
 * system interface over it. There is no page here — the environment is the product.
 */
export default function App() {
  useKeyboardCommands();
  useContextEngine();
  useMemory();
  useMultimodalContext();
  useNativeAwareness();

  /**
   * Presentation mode withholds the developer instruments and nothing else.
   *
   * The environment, the command layer and every input are exactly what they
   * are the rest of the time — a demonstration of NOVA, not of a demo mode.
   *
   * The camera view is explicitly *not* a developer instrument. It is the only
   * place a room can see what the hand tracker sees, so it stays mountable
   * while presenting; it is simply closed until somebody asks for it. Only the
   * context inspector, which is genuinely for whoever is building NOVA, is
   * withheld.
   */
  const presenting = useSpatialStore((state) => state.presentation);

  return (
    <div className="nova-root">
      <HandInputDriver />
      <SpatialScene />
      <WindowSurfaceLayer />
      <div className="nova-interface">
        <WorkspaceRail />
        <SystemLayer />
        <CommandLine />
      </div>
      <SpatialCursor />
      <VisionDebugPanel />
      {import.meta.env.DEV && !presenting && <ContextInspector />}
    </div>
  );
}
