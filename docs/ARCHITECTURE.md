# NOVA architecture, phase by phase

NOVA is a single spatial shell. Each phase below built on the running system
left by the one before it — adding a producer of commands, a layer that
understands them, or a boundary to the real computer — without replacing what
was there. The phase pages in [phases/](phases/README.md) give the detail and the
commits.

```
MAIN NOVA (Phases 1–2)
  one rule: nothing changes NOVA's state except a NovaCommand
  mouse, keyboard, hand ─→ inputRouter ─→ interactionSystem ─→ commandBus ─→ spatialStore ─→ renderers
        │
        ▼
Phase 3 — Intelligence
  server.ts: Gemini turns a sentence into structured intent (with an offline fallback)
        │
        ▼
Phase 4 — Context
  intentRouter + contextBridge wire that intent into the live command line;
  a derived context graph resolves "this", "it", "the one on the right"
        │
        ▼
Phase 5 — Memory
  arrangements saved deliberately; a restore is a plan of ordinary commands
        │
        ▼
Phase 6 — Voice
  a spoken sentence enters the same routeUtterance a typed one does
        │
        ▼
Phase 7 — Multimodal
  devices contribute a referent, never a command; SystemAdapter seam declared
        │
        ▼
Phase 8 — Native Awareness
  read-only snapshot of the host (GET /api/native/snapshot), never merged into spatial state
        │
        ▼
Phase 9 — Native Application Control
  one capability, OPEN_APPLICATION: gio launch, shell: false, server-side allowlist
        │
        ▼
Phase 9.5 — Application Discovery
  names resolve against the installed catalog to desktop ids; the server re-validates membership
        │
        ▼
Phase 9.5B — Gesture-Native Control
  point + double pinch becomes "open <window>" through routeUtterance; air click hardened
        │
        ▼
Phase 10 — Intelligence Core
  a conversation (converse) in front of routeUtterance: replies are shown,
  actions become one NOVA sentence for the same pipeline
        │
        ▼
Phase 11 / 11B / 11C — Spatial Environment
  a dark-to-mid room built around the NOVA Spatial Core: wall arcs and light
  field, vast distant rings, floor rings and ground light, distant architecture,
  ambient points, layered parallax; an ambience module reads existing state and
  the Core and room respond — it acts on nothing
```

## What stays constant across every phase

- **One command path.** Mouse, keyboard, hand, voice, text, Gemini, the Command
  Deck, gestures and the Phase 10 conversation all end at `commandBus.dispatch`.
  Sentences from voice, text, Gemini, gestures, the deck and conversational
  actions pass through `routeUtterance` first.
- **One source of truth.** `src/state/spatialStore.ts`; renderers interpolate
  toward it and never write back. The context graph (Phase 4), memory (Phase 5)
  and native–spatial comparison (9.5B) are derived from it, never authoritative.
- **Narrow boundaries to the real computer.** Reading (Phase 8,
  `native/linuxProvider.ts`) and acting (Phase 9, `native/linuxLauncher.ts`) are
  separate files, and the only action is opening an installed application by an
  identity the server validates itself.

## Where each phase lives in the tree

| Area | Introduced | Grew in |
| --- | --- | --- |
| `src/state/`, `src/systems/{command,input,interaction,window,workspace}/`, `src/components/` | Phase 1 | most later phases |
| `src/vision/`, `src/systems/input/handInputSource.ts` | Phase 2 | 9.5B presentation, 9.5B air click |
| `server.ts`, `src/types/nova.ts`, `src/services/` | Phase 3 | `server.ts`: 4, 5, 8, 9, 9.5A · `nova.ts`: 5 |
| `src/systems/context/`, `intentRouter.ts`, `contextBridge.ts` | Phase 4 | 5, 6, 7, 8, 9, 9.5A, 9.5B presentation |
| `src/systems/memory/` | Phase 5 | — |
| `src/systems/voice/` | Phase 6 | 9.5B presentation |
| `src/systems/multimodal/` | Phase 7 | 8, 9, 9.5B gestures, 9.5B presentation, 9.5B air click |
| `native/linuxProvider.ts`, `src/systems/native/` | Phase 8 (`systemAdapter.ts`: Phase 7) | 9, 9.5A, 9.5B sync, 9.5B presentation |
| `native/linuxLauncher.ts` | Phase 9 | 9.5A |
| `src/systems/intelligence/`, `IntelligenceSurface.tsx`, `POST /api/intelligence/turn` | Phase 10 | — |
| `src/systems/environment/`, `environmentShaders.ts`, `EnvironmentRig.tsx` (rewritten), `PALETTE` | Phase 11 (`EnvironmentRig.tsx`: Phase 1) | — |
| `SpatialCore.tsx`, `AmbientField.tsx`, `SpatialCoreLabel.tsx`, `ambientField.ts` | Phase 11B | 11C (`SpatialCore.tsx` redrawn as the bloom) |
| The dot-matrix bloom, the point-lattice floor and `--env-*` tokens | Phase 11C | 11D (floor coloured) |
| The colour field, the mid layer of dot-matrix ribbons (`MIDGROUND_FRAGMENT`), the colourful palette, `spatialCoreLight` | Phase 11D | 11E (relit: blue-grey room, colour as meaningful light, arc, frames, orbit) |
| `src/systems/portal/`, `PortalDriver.tsx`, `PortalLayer.tsx`, `appIcons.ts`, `spatialStore.portal`, `{ action: 'portal' }` | Phase 12 | — |

File-level detail, generated from git history: [phases/FILE-MAP.md](phases/FILE-MAP.md).
