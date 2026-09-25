import { DEFAULT_LAYERS, layerForApp } from '../../data/layers';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { interpret } from '../command/commandParser';
import { presentWindow } from '../window/windowPresentation';
import { buildGeminiContext } from '../context/contextGraph';
import { getCurrentContext } from '../context/contextEngine';
import type { SpatialWindow } from '../../types/window';

let checks = 0;
let failures = 0;

function assert(condition: boolean, message: string) {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${message}`);
  }
}

function pass(message: string) {
  console.log(`✓ ${message}`);
}

console.log('\n=== NOVA Phase 13 · Spatial Application Layers ===\n');

// 1. Layer Model & Configuration
console.log('--- Layer Configuration ---');
{
  assert(DEFAULT_LAYERS.length >= 2, 'at least 2 spatial application layers defined');
  assert(DEFAULT_LAYERS[0].id === 'home', 'layer 0 is Home layer');
  assert(DEFAULT_LAYERS[1].id === 'development', 'layer 1 is Development layer');

  const homeApps = DEFAULT_LAYERS[0].applications;
  const devApps = DEFAULT_LAYERS[1].applications;

  assert(homeApps.includes('browser'), 'Home layer includes browser');
  assert(devApps.includes('code'), 'Development layer includes code');
  assert(devApps.includes('terminal'), 'Development layer includes terminal');

  assert(layerForApp('code') === 1, 'code maps to Development layer (index 1)');
  assert(layerForApp('browser') === 0, 'browser maps to Home layer (index 0)');
  assert(layerForApp('unknown-app') === 0, 'unknown apps default to Home layer');
  pass('Layer configuration is deterministic and authoritative');
}

// 2. Spatial Store Navigation & Transition Lifecycle
console.log('--- Layer Navigation Lifecycle ---');
{
  const store = useSpatialStore.getState();
  // Ensure starting at layer 0
  store.completeLayerTransition();
  useSpatialStore.setState({
    layer: {
      layers: DEFAULT_LAYERS,
      currentLayerIndex: 0,
      targetLayerIndex: 0,
      phase: 'idle',
      direction: null,
      progress: 0,
      transitionStartedAt: 0,
    },
  });

  const state1 = useSpatialStore.getState();
  assert(state1.layer.currentLayerIndex === 0, 'starts on layer 0');
  assert(state1.layer.phase === 'idle', 'initial phase is idle');

  // Boundary clamp: previous from layer 0 must not transition
  const prevFrom0 = state1.navigateLayer('previous');
  assert(prevFrom0 === false, 'cannot navigate previous from first layer');
  assert(useSpatialStore.getState().layer.currentLayerIndex === 0, 'stays at layer 0 on boundary previous');
  assert(useSpatialStore.getState().layer.phase === 'idle', 'phase stays idle on blocked navigation');

  // Navigate next to layer 1
  const nextFrom0 = useSpatialStore.getState().navigateLayer('next');
  assert(nextFrom0 === true, 'navigate next succeeds');
  const transitioningState = useSpatialStore.getState();
  assert(transitioningState.layer.phase === 'transitioning', 'phase enters transitioning');
  assert(transitioningState.layer.targetLayerIndex === 1, 'targetLayerIndex is 1');
  assert(transitioningState.layer.direction === 'next', 'direction is next');

  // Transition locking: new navigation ignored while transitioning
  const lockedNext = useSpatialStore.getState().navigateLayer('next');
  assert(lockedNext === false, 'transition locking prevents new navigation while transitioning');

  // Progress update
  useSpatialStore.getState().setLayerProgress(0.5);
  assert(useSpatialStore.getState().layer.progress === 0.5, 'progress can be set during transition');

  // Complete transition
  useSpatialStore.getState().completeLayerTransition();
  const completedState = useSpatialStore.getState();
  assert(completedState.layer.phase === 'idle', 'phase returns to idle upon completion');
  assert(completedState.layer.currentLayerIndex === 1, 'currentLayerIndex becomes 1');
  assert(completedState.layer.progress === 0, 'progress resets to 0');
  assert(completedState.layer.direction === null, 'direction resets to null');

  // Go back to layer 0
  const backTo0 = useSpatialStore.getState().navigateLayer('previous');
  assert(backTo0 === true, 'navigate previous succeeds from layer 1');
  assert(useSpatialStore.getState().layer.targetLayerIndex === 0, 'target is layer 0');
  useSpatialStore.getState().completeLayerTransition();
  assert(useSpatialStore.getState().layer.currentLayerIndex === 0, 'back on layer 0');

  // Direct navigation by index and name
  const goToDev = useSpatialStore.getState().goToLayer('development');
  assert(goToDev === true, 'goToLayer by name succeeds');
  assert(useSpatialStore.getState().layer.targetLayerIndex === 1, 'navigating to development target 1');
  useSpatialStore.getState().completeLayerTransition();

  const goInvalid = useSpatialStore.getState().goToLayer('non-existent-layer');
  assert(goInvalid === false, 'goToLayer with invalid name is safely ignored');
  pass('Transition lifecycle enforces boundaries and locking');
}

// 3. Command Bus Integration
console.log('--- Command Bus Integration ---');
{
  useSpatialStore.setState({
    layer: {
      layers: DEFAULT_LAYERS,
      currentLayerIndex: 0,
      targetLayerIndex: 0,
      phase: 'idle',
      direction: null,
      progress: 0,
      transitionStartedAt: 0,
    },
  });

  dispatch({ action: 'layer', direction: 'next' }, 'gesture');
  assert(useSpatialStore.getState().layer.phase === 'transitioning', 'command bus layer action triggers transition');
  assert(useSpatialStore.getState().layer.targetLayerIndex === 1, 'target layer index is 1');
  useSpatialStore.getState().completeLayerTransition();

  dispatch({ action: 'layer-go', target: 0 }, 'system');
  assert(useSpatialStore.getState().layer.targetLayerIndex === 0, 'command bus layer-go returns to 0');
  useSpatialStore.getState().completeLayerTransition();
  pass('Command bus routes layer actions without direct state mutation');
}

// 4. Phrasing & Natural Language Parsing
console.log('--- Utterance & Command Parser ---');
{
  const nextParsed = interpret('next layer');
  assert(nextParsed.understood === true, '"next layer" understood');
  assert(nextParsed.commands[0]?.action === 'layer', 'action is layer');
  assert((nextParsed.commands[0] as any)?.direction === 'next', 'direction is next');

  const prevParsed = interpret('previous layer');
  assert(prevParsed.understood === true, '"previous layer" understood');
  assert((prevParsed.commands[0] as any)?.direction === 'previous', 'direction is previous');

  const goParsed = interpret('go to layer 2');
  assert(goParsed.understood === true, '"go to layer 2" understood');
  assert(goParsed.commands[0]?.action === 'layer-go', 'action is layer-go');
  assert((goParsed.commands[0] as any)?.target === 1, '1-based layer 2 converted to 0-based index 1');
  pass('Voice and text command phrases resolve deterministically');
}

// 5. 3D Spatial Presentation & Depth Hierarchy
console.log('--- Spatial Depth Hierarchy & Presentation ---');
{
  const testWindow: SpatialWindow = {
    id: 'code',
    app: 'code',
    title: 'Code',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 1,
    width: 2.92,
    height: 1.86,
    focused: false,
    minimized: false,
    lifecycle: 'settled',
    lifecycleAt: 0,
  };

  // When on Layer 0 (Home), 'code' (Layer 1) must be pushed into background depth
  const presentationBackground = presentWindow(testWindow, {
    dockOrder: [],
    corePosition: { x: 0, y: 0, z: 0 },
    now: 1000,
    layerState: {
      layers: DEFAULT_LAYERS,
      currentLayerIndex: 0,
      targetLayerIndex: 0,
      phase: 'idle',
      direction: null,
      progress: 0,
      transitionStartedAt: 0,
    },
  });

  assert(presentationBackground.position.z < 0, 'code window in midground/background is pushed back in Z');
  assert(presentationBackground.scale < 1, 'code window in background is scaled down');
  assert(presentationBackground.opacity < 1, 'code window in background has reduced opacity');

  // When on Layer 1 (Development), 'code' (Layer 1) must be in foreground
  const presentationForeground = presentWindow(testWindow, {
    dockOrder: [],
    corePosition: { x: 0, y: 0, z: 0 },
    now: 1000,
    layerState: {
      layers: DEFAULT_LAYERS,
      currentLayerIndex: 1,
      targetLayerIndex: 1,
      phase: 'idle',
      direction: null,
      progress: 0,
      transitionStartedAt: 0,
    },
  });

  assert(presentationForeground.position.z === 0, 'code window in active layer rests at normal depth');
  assert(presentationForeground.scale === 1, 'code window in active layer has full scale');
  assert(presentationForeground.opacity === 1, 'code window in active layer has full opacity');
  pass('Spatial presentation enforces foreground/midground/background depth');
}

// 6. Gemini Context Projection
console.log('--- Gemini Context Projection ---');
{
  useSpatialStore.setState({
    layer: {
      layers: DEFAULT_LAYERS,
      currentLayerIndex: 1,
      targetLayerIndex: 1,
      phase: 'idle',
      direction: null,
      progress: 0,
      transitionStartedAt: 0,
    },
  });

  const geminiContext = buildGeminiContext(getCurrentContext());
  assert(geminiContext.currentLayer !== undefined, 'currentLayer projected to Gemini context');
  assert(geminiContext.currentLayer?.id === 'development', 'projected currentLayer id matches');
  assert(geminiContext.currentLayer?.name === 'Development', 'projected currentLayer name matches');
  assert(Array.isArray(geminiContext.currentLayer?.applications), 'currentLayer applications is an array');
  assert(geminiContext.availableLayers?.length === DEFAULT_LAYERS.length, 'availableLayers projected');
  pass('AI context receives clean semantic layer projection without scene coordinates');
}

// 7. Stable Positions on Return
console.log('--- Stable Positions On Return ---');
{
  const store = useSpatialStore.getState();
  const initialBrowserPos = { ...store.windows.browser.position };

  // Navigate to layer 1 and back to layer 0
  store.goToLayer(1);
  store.completeLayerTransition();
  store.goToLayer(0);
  store.completeLayerTransition();

  const returnedBrowserPos = useSpatialStore.getState().windows.browser.position;
  assert(
    initialBrowserPos.x === returnedBrowserPos.x &&
    initialBrowserPos.y === returnedBrowserPos.y &&
    initialBrowserPos.z === returnedBrowserPos.z,
    'window position is preserved stably when returning to a layer',
  );
  pass('Window transforms remain stable across layer transitions');
}

console.log(`\n========================================`);
if (failures > 0) {
  throw new Error(`${failures} of ${checks} spatial layer assertions FAILED`);
} else {
  console.log(`ALL ${checks} SPATIAL LAYER ASSERTIONS PASSED! 🎉`);
  console.log(`========================================\n`);
}
