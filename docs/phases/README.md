# NOVA phase history

NOVA is **one application**, developed sequentially from Phase 1 onward.
Each phase added to the same codebase; none is a separate app, and there are no
per-phase source folders. The production code lives where it runs — `src/`,
`native/` and `server.ts` — and these pages record what each phase contributed
to it.

Phases 1–9.5B are derived from the git history of
[`BuiltbyParas/NOVA`](https://github.com/BuiltbyParas/NOVA), branch
`phase8-native-awareness`. NOVA2 is a snapshot of that repository at `096e019`
(without `NOVA-source.zip`). Phases 10 and 11 were developed in NOVA2 itself, so
their commits are in this repository, and their files are listed at the end of
[FILE-MAP.md](FILE-MAP.md). Where a
commit has no message body, the phase page says so and draws on the README as it
stood at that commit instead.

| Phase | Name | Status | Commit(s) | Branch | Page |
| --- | --- | --- | --- | --- | --- |
| 1 | Spatial Environment | complete | `f8d2fcc`, `dc3c643`, `ef20867` | `main` | [main.md](main.md) |
| 2 | Hand Interaction | complete | `7246972` | `main` | [main.md](main.md) |
| 3 | Gemini Intelligence | complete | `4e894d6` | `phase3-integration` | [phase-3.md](phase-3.md) |
| 4 | Context Awareness | complete | `33bdbbb` | `phase4-context-engine` | [phase-4.md](phase-4.md) |
| 5 | Spatial Memory | complete | `dd10b0b` | `phase5-spatial-memory` | [phase-5.md](phase-5.md) |
| 6 | Voice | complete | `e56e34d` | `phase6-voice-intelligence` | [phase-6.md](phase-6.md) |
| 7 | Multimodal | complete | `f884673` | `phase7-multimodal` | [phase-7.md](phase-7.md) |
| 8 | Native System Awareness | complete | `586ce2c` | `phase8-native-awareness` | [phase-8.md](phase-8.md) |
| 9 | Native Application Control | complete | `7f53b90` | `phase8-native-awareness` | [phase-9.md](phase-9.md) |
| 9.5 (9.5A) | Universal Application Discovery | complete | `e27ac8e` | `phase8-native-awareness` | [phase-9.5.md](phase-9.5.md) |
| 9.5B | Gesture-Native Control | complete | `dc86804`, `522c6d0` (+ five commits between) | `phase8-native-awareness` | [phase-9.5b.md](phase-9.5b.md) |
| 10 | NOVA Intelligence Core | complete | NOVA2 (after the snapshot) | `main` (NOVA2) | [phase-10.md](phase-10.md) |
| 11 | Spatial Visual Environment | complete | NOVA2 | `main` (NOVA2) | [phase-11.md](phase-11.md) |
| 12 | NOVA Application Portal | complete | NOVA2 (merged with 13) | `main` (NOVA2) | [phase-12.md](phase-12.md) |
| 13 | Spatial Application Layers | current state | `2af2e5f` (merged with 10–12) | `main` (NOVA2) | — (no phase document yet) |

The branch named for Phase 8 carries all later phases too; Phases 9 onward were
committed on it rather than on branches of their own.

Before Phase 3 joined NOVA, it was prototyped as a separate Google AI Studio app
in [`BuiltbyParas/NOVA-phase3`](https://github.com/BuiltbyParas/NOVA-phase3)
(`97d382e`, `b2f981f`). That is a separate history, not an ancestor of NOVA.

- [FILE-MAP.md](FILE-MAP.md) — every current file, with the phase that introduced
  it and every phase that later changed it.
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — how the phases stack into one system.

Note: `BuiltbyParas/NOVA` is a private repository, so the commit hashes above
resolve only for people with access to it.
