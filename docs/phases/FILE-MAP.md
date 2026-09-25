# File ownership map

Where each current file in NOVA2 came from, derived mechanically from the git history of
[`BuiltbyParas/NOVA`](https://github.com/BuiltbyParas/NOVA) (branch `phase8-native-awareness`)
with `git log -- <file>`. NOVA2 itself holds a single snapshot commit, so the history lives there.

**Introduced** is the commit that added the file. **Also changed in** lists every later commit that
modified it, in order. A file that evolved across phases is listed under all of them, not assigned to one.

| Label | Commit(s) |
| --- | --- |
| Phase 1 | `f8d2fcc`, `dc3c643`, `ef20867` |
| Phase 2 | `7246972` |
| Phase 3 | `4e894d6` |
| Phase 4 | `33bdbbb` |
| Phase 5 | `dd10b0b` |
| Phase 6 | `e56e34d` |
| Phase 7 | `f884673` |
| Phase 8 | `586ce2c` |
| Phase 9 | `7f53b90` |
| Phase 9.5A | `e27ac8e` |
| 9.5B gestures | `dc86804` — gestures through the command pipeline |
| 9.5B sync | `91d9f74` — native–spatial synchronisation |
| 9.5B presentation | `17aa729` — presentation sprint |
| 9.5B pulse | `8185b49` — NOVA Pulse |
| 9.5B focus moment | `b18a096` — focus moment |
| 9.5B deck | `3515b79` — Command Deck |
| 9.5B air click | `522c6d0` — air click hardening |
| housekeeping | `096e019` — tooling files only |

The four commits `91d9f74`–`3515b79` carry no phase number in their messages. They are labelled 9.5B
because they sit between `dc86804` and `522c6d0` in history, not because a commit says so.

`package.json` changes in almost every phase, because each phase added its test script. The README's
Phase 9–9.5B documentation was written later, in NOVA2's own commit `425e82e`, so it does not appear here.

## `(repository root)`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `.env.example` | Phase 3 | — |
| `.eslintignore` | Phase 2 | — |
| `.gitignore` | Phase 1 | — |
| `.npmrc` | Phase 1 | — |
| `.oxlintrc.json` | Phase 1 | — |
| `README.md` | Phase 1 | Phase 2, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, Phase 9.5A |
| `index.html` | Phase 1 | 9.5B presentation |
| `metadata.json` | Phase 3 | — |
| `package-lock.json` | Phase 1 | Phase 2, Phase 3 |
| `package.json` | Phase 1 | Phase 2, Phase 3, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, Phase 9, Phase 9.5A, 9.5B gestures, 9.5B sync, 9.5B presentation |
| `server.ts` | Phase 3 | Phase 4, Phase 5, Phase 8, Phase 9, Phase 9.5A |
| `skills-lock.json` | housekeeping | — |
| `tsconfig.app.json` | Phase 1 | — |
| `tsconfig.json` | Phase 1 | — |
| `tsconfig.node.json` | Phase 1 | Phase 8 |
| `vite.config.ts` | Phase 1 | — |

## `src/ (root)`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/App.tsx` | Phase 1 | Phase 2, Phase 4, Phase 5, Phase 7, Phase 8, 9.5B presentation |
| `src/components/CommandOutputViewer.tsx` | Phase 3 | — |
| `src/components/ContextEditor.tsx` | Phase 3 | — |
| `src/components/HandoffDocPanel.tsx` | Phase 3 | — |
| `src/components/SpatialViewport.tsx` | Phase 3 | — |
| `src/components/TestSuitePanel.tsx` | Phase 3 | — |
| `src/data/apps.ts` | Phase 1 | Phase 9.5A |
| `src/data/environment.ts` | Phase 1 | — |
| `src/data/tasks.ts` | Phase 4 | — |
| `src/data/workspaces.ts` | Phase 1 | — |
| `src/index.css` | Phase 1 | Phase 2, Phase 4, Phase 5, Phase 6, Phase 7, Phase 8, 9.5B sync, 9.5B presentation, 9.5B pulse, 9.5B focus moment, 9.5B deck, 9.5B air click |
| `src/main.tsx` | Phase 1 | — |
| `src/services/novaContext.ts` | Phase 3 | — |
| `src/services/testSuiteData.ts` | Phase 3 | — |
| `src/state/spatialStore.ts` | Phase 1 | Phase 2, Phase 4, 9.5B presentation |
| `src/types/command.ts` | Phase 1 | Phase 2, Phase 4, Phase 5, Phase 6, Phase 9.5A |
| `src/types/context.ts` | Phase 4 | Phase 5, Phase 7, Phase 8 |
| `src/types/memory.ts` | Phase 5 | — |
| `src/types/multimodal.ts` | Phase 7 | — |
| `src/types/native.ts` | Phase 8 | — |
| `src/types/nativeAction.ts` | Phase 9 | Phase 9.5A |
| `src/types/nativeSync.ts` | 9.5B sync | — |
| `src/types/nova.ts` | Phase 3 | Phase 5 |
| `src/types/spatial.ts` | Phase 1 | — |
| `src/types/voice.ts` | Phase 6 | 9.5B presentation |
| `src/types/window.ts` | Phase 1 | — |
| `src/types/workspace.ts` | Phase 1 | — |
| `src/utils/geometry.ts` | Phase 1 | — |
| `src/utils/math.ts` | Phase 1 | — |
| `src/utils/textures.ts` | Phase 1 | 9.5B presentation |
| `src/vision/gestureRecognizer.ts` | Phase 2 | 9.5B air click |
| `src/vision/handTracker.ts` | Phase 2 | — |
| `src/vision/smoothing.ts` | Phase 2 | — |
| `src/vision/useHandPresence.ts` | 9.5B presentation | — |
| `src/vision/verifyVision.ts` | Phase 2 | 9.5B presentation, 9.5B air click |
| `src/vision/visionTypes.ts` | Phase 2 | — |
| `src/vite-env.d.ts` | Phase 1 | — |

## `src/components/core`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/components/core/NovaCore.tsx` | Phase 1 | 9.5B presentation |

## `src/components/debug`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/components/debug/ContextInspector.tsx` | Phase 4 | Phase 5, Phase 7, Phase 8, 9.5B sync |
| `src/components/debug/VisionDebugPanel.tsx` | Phase 2 | — |

## `src/components/interface`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/components/interface/CommandDeck.tsx` | 9.5B deck | 9.5B air click |
| `src/components/interface/CommandLine.tsx` | Phase 1 | Phase 4, Phase 5, Phase 6, 9.5B presentation |
| `src/components/interface/SpatialCursor.tsx` | Phase 1 | 9.5B presentation |
| `src/components/interface/StatusHUD.tsx` | 9.5B presentation | 9.5B pulse |
| `src/components/interface/SystemLayer.tsx` | Phase 1 | Phase 2, Phase 6, 9.5B presentation, 9.5B deck |
| `src/components/interface/VoicePanel.tsx` | 9.5B presentation | — |
| `src/components/interface/WorkspaceRail.tsx` | Phase 1 | — |

## `src/components/spatial`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/components/spatial/CSS3DRenderPass.tsx` | Phase 1 | — |
| `src/components/spatial/CameraRig.tsx` | Phase 1 | — |
| `src/components/spatial/EnvironmentRig.tsx` | Phase 1 | 9.5B presentation |
| `src/components/spatial/HandInputDriver.tsx` | Phase 2 | 9.5B presentation |
| `src/components/spatial/InteractionDriver.tsx` | Phase 1 | — |
| `src/components/spatial/PerformanceGovernor.tsx` | Phase 1 | — |
| `src/components/spatial/SpatialScene.tsx` | Phase 1 | — |
| `src/components/spatial/useSurfaceObject.ts` | Phase 1 | — |

## `src/components/windows`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/components/windows/SpatialWindowView.tsx` | Phase 1 | Phase 2, 9.5B presentation, 9.5B air click |
| `src/components/windows/WindowSurface.tsx` | Phase 1 | 9.5B presentation, 9.5B focus moment |
| `src/components/windows/WindowSurfaceLayer.tsx` | Phase 1 | 9.5B focus moment |
| `src/components/windows/surfaceRegistry.ts` | Phase 1 | — |
| `src/components/windows/surfaces/BrowserSurface.tsx` | Phase 1 | — |
| `src/components/windows/surfaces/CodeSurface.tsx` | Phase 1 | — |
| `src/components/windows/surfaces/FilesSurface.tsx` | Phase 1 | — |
| `src/components/windows/surfaces/NotesSurface.tsx` | Phase 1 | — |
| `src/components/windows/surfaces/TerminalSurface.tsx` | Phase 1 | — |

## `src/systems/command`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/command/commandBus.ts` | Phase 1 | Phase 2, Phase 4, Phase 5, Phase 6, Phase 9, Phase 9.5A, 9.5B presentation |
| `src/systems/command/commandParser.ts` | Phase 1 | Phase 9.5A, 9.5B presentation |
| `src/systems/command/contextBridge.ts` | Phase 4 | Phase 5, Phase 6, Phase 9, Phase 9.5A, 9.5B presentation |
| `src/systems/command/intentRouter.ts` | Phase 4 | Phase 5, Phase 6, Phase 7, Phase 9.5A, 9.5B presentation |
| `src/systems/command/verifyBuiltinCommands.ts` | 9.5B presentation | — |

## `src/systems/context`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/context/contextEngine.ts` | Phase 4 | Phase 5, Phase 7, Phase 8 |
| `src/systems/context/contextGraph.ts` | Phase 4 | Phase 5, Phase 7, Phase 8 |
| `src/systems/context/referenceResolver.ts` | Phase 4 | Phase 7 |
| `src/systems/context/spatialRelations.ts` | Phase 4 | — |
| `src/systems/context/useContextEngine.ts` | Phase 4 | — |
| `src/systems/context/verifyContext.ts` | Phase 4 | — |

## `src/systems/input`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/input/handInputSource.ts` | Phase 2 | — |
| `src/systems/input/inputRouter.ts` | Phase 1 | Phase 7 |
| `src/systems/input/keyboardCommands.ts` | Phase 1 | Phase 2, Phase 4, Phase 6, 9.5B presentation |
| `src/systems/input/mouseInputSource.ts` | Phase 1 | — |
| `src/systems/input/types.ts` | Phase 1 | Phase 2, Phase 6 |

## `src/systems/interaction`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/interaction/interactionSystem.ts` | Phase 1 | Phase 2, Phase 7, 9.5B gestures, 9.5B air click |
| `src/systems/interaction/targetRegistry.ts` | Phase 1 | — |

## `src/systems/memory`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/memory/memoryManager.ts` | Phase 5 | — |
| `src/systems/memory/memoryRepository.ts` | Phase 5 | — |
| `src/systems/memory/memoryResolver.ts` | Phase 5 | — |
| `src/systems/memory/memorySerializer.ts` | Phase 5 | — |
| `src/systems/memory/memoryStore.ts` | Phase 5 | — |
| `src/systems/memory/useMemory.ts` | Phase 5 | — |
| `src/systems/memory/verifyMemory.ts` | Phase 5 | — |

## `src/systems/multimodal`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/multimodal/gestureCommands.ts` | 9.5B gestures | — |
| `src/systems/multimodal/gestureIntent.ts` | 9.5B gestures | — |
| `src/systems/multimodal/interactionContext.ts` | Phase 7 | — |
| `src/systems/multimodal/multimodalDriver.ts` | Phase 7 | — |
| `src/systems/multimodal/pipelineTrace.ts` | Phase 7 | — |
| `src/systems/multimodal/referentResolution.ts` | Phase 7 | 9.5B presentation |
| `src/systems/multimodal/verifyGestureIntent.ts` | 9.5B gestures | 9.5B air click |
| `src/systems/multimodal/verifyMultimodal.ts` | Phase 7 | Phase 8, Phase 9, 9.5B presentation |

## `src/systems/native`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/native/appIdentityMap.ts` | Phase 8 | — |
| `src/systems/native/applicationCatalog.ts` | Phase 9.5A | — |
| `src/systems/native/nativeActions.ts` | Phase 9 | Phase 9.5A, 9.5B sync |
| `src/systems/native/nativeBridge.ts` | Phase 8 | — |
| `src/systems/native/nativeSpatialSync.ts` | 9.5B sync | — |
| `src/systems/native/nativeStore.ts` | Phase 8 | — |
| `src/systems/native/systemAdapter.ts` | Phase 7 | Phase 8, Phase 9 |
| `src/systems/native/useNativeAwareness.ts` | Phase 8 | — |
| `src/systems/native/verifyApplicationCatalog.ts` | Phase 9.5A | — |
| `src/systems/native/verifyNative.ts` | Phase 8 | Phase 9 |
| `src/systems/native/verifyNativeAction.ts` | Phase 9 | Phase 9.5A, 9.5B presentation |
| `src/systems/native/verifyNativeSpatialSync.ts` | 9.5B sync | — |

## `src/systems/voice`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/voice/microphone.ts` | 9.5B presentation | — |
| `src/systems/voice/speechRecognizer.ts` | Phase 6 | — |
| `src/systems/voice/verifyVoice.ts` | Phase 6 | 9.5B presentation |
| `src/systems/voice/voiceInputSource.ts` | Phase 6 | 9.5B presentation |
| `src/systems/voice/voicePipeline.ts` | Phase 6 | — |
| `src/systems/voice/voiceStore.ts` | Phase 6 | — |

## `src/systems/window`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/window/windowPresentation.ts` | Phase 1 | Phase 2 |

## `src/systems/workspace`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `src/systems/workspace/layoutEngine.ts` | Phase 1 | — |

## `native/`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `native/linuxLauncher.ts` | Phase 9 | Phase 9.5A |
| `native/linuxProvider.ts` | Phase 8 | Phase 9, Phase 9.5A |

## `public/`

| File | Introduced | Also changed in |
| --- | --- | --- |
| `public/favicon.svg` | Phase 1 | — |
| `public/icons.svg` | Phase 1 | — |
| `public/models/hand_landmarker.task` | Phase 2 | — |
| `public/wasm/vision_wasm_internal.js` | Phase 2 | — |
| `public/wasm/vision_wasm_internal.wasm` | Phase 2 | — |
| `public/wasm/vision_wasm_nosimd_internal.js` | Phase 2 | — |
| `public/wasm/vision_wasm_nosimd_internal.wasm` | Phase 2 | — |

## `.agents/`

73 files of the third-party `ui-ux-pro-max` design skill (tracked by `skills-lock.json`), added in
`096e019` as housekeeping. They are tooling for the assistant that built NOVA, not part of the application,
and no phase introduced them.
