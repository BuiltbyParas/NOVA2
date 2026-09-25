import type { NovaCommand } from '../../types/command';
import type {
  MemorySummary,
  RestorePlan,
  RestoreReport,
  SpatialMemory,
} from '../../types/memory';
import type { AppType } from '../../types/window';
import { APPS } from '../../data/apps';
import { getCurrentContext } from '../context/contextEngine';
import { getRepository } from './memoryRepository';
import { createMemory, migrate, summarize } from './memorySerializer';
import { useMemoryStore } from './memoryStore';

/**
 * Save, list, delete and restore.
 *
 * The one rule that shapes this file: **the memory layer never writes spatial
 * state.** A restore is expressed entirely in commands the bus already has —
 * `workspace`, `task`, `move`, `scale`, `rotate`, `minimize`/`restore`, `focus`
 * — so a remembered arrangement reaches the screen by exactly the same path a
 * mouse drag does. Memory proposes; the command bus disposes.
 *
 * Nothing here imports the command bus. `planRestore` produces the commands and
 * the bus runs them, which keeps the dependency pointing one way — bus → memory,
 * exactly as the architecture diagram has it — and leaves the plan a pure value
 * a test can assert without anything moving.
 */

const readableName = (id: string, app?: string) =>
  APPS[(app ?? id) as AppType]?.name ?? id;

/** Refresh the metadata the interface renders from. Called after every change. */
function publish() {
  const summaries = getRepository().getAll().map(summarize);
  useMemoryStore.getState().setSummaries(summaries);
  return summaries;
}

/** Load the whole collection, validating and migrating each record. */
export function listMemories(): SpatialMemory[] {
  return getRepository()
    .getAll()
    .map((record) => migrate(record))
    .filter((record): record is SpatialMemory => record !== null);
}

export function listMemorySummaries(): MemorySummary[] {
  return listMemories().map(summarize);
}

export function getMemory(id: string): SpatialMemory | null {
  const record = getRepository().get(id);
  return record ? migrate(record) : null;
}

/**
 * Take a memory of the current arrangement.
 *
 * Saving under a name that already exists updates that memory rather than
 * creating a second one — otherwise saying "save this as my database workspace"
 * a second time would manufacture the exact ambiguity the resolver then has to
 * refuse to resolve.
 */
export function saveCurrentAs(name: string): SpatialMemory | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const existing =
    listMemories().find((memory) => memory.name.toLowerCase() === trimmed.toLowerCase()) ?? null;

  const memory = createMemory(trimmed, getCurrentContext(), existing);
  getRepository().save(memory);
  publish();
  return memory;
}

export function deleteMemory(id: string): boolean {
  const removed = getRepository().delete(id);
  if (removed) publish();
  return removed;
}

export function clearMemories() {
  getRepository().clear();
  publish();
}

/**
 * Work out how to get back to a remembered arrangement.
 *
 * Pure: current window ids in, an ordered list of commands out. The order is the
 * deterministic restore sequence — workspace, then task, then each window's
 * visibility, place, size and angle, and focus last so nothing overwrites it.
 *
 * A window in the memory that no longer exists is skipped and reported. It is
 * not silently re-opened: the user asked to return to an arrangement, not to
 * have NOVA decide on their behalf that a closed application should come back.
 */
export function planRestore(memory: SpatialMemory, presentIds: Set<string>): RestorePlan {
  const commands: NovaCommand[] = [];
  const missing: string[] = [];
  const restored: string[] = [];
  const { snapshot } = memory;

  commands.push({ action: 'workspace', target: snapshot.workspace.id });
  if (snapshot.task) commands.push({ action: 'task', target: snapshot.task.id });
  if (snapshot.layerIndex !== undefined) {
    commands.push({ action: 'layer-go', target: snapshot.layerIndex });
  }

  for (const win of snapshot.windows) {
    if (!presentIds.has(win.id)) {
      missing.push(win.id);
      continue;
    }
    commands.push(
      win.minimized
        ? { action: 'minimize', target: win.id }
        : { action: 'restore', target: win.id },
    );
    commands.push({ action: 'move', target: win.id, position: { ...win.position } });
    commands.push({ action: 'scale', target: win.id, scale: win.scale });
    commands.push({ action: 'rotate', target: win.id, rotation: { ...win.rotation } });
    restored.push(win.id);
  }

  // Focus last: switching workspace and un-minimizing both move focus, so
  // asserting it earlier would be overwritten before the plan finished.
  if (snapshot.focusedWindow && presentIds.has(snapshot.focusedWindow)) {
    commands.push({ action: 'focus', target: snapshot.focusedWindow });
  } else {
    commands.push({ action: 'blur' });
  }

  return { memoryId: memory.id, memoryName: memory.name, commands, missing, restored };
}

function describe(plan: RestorePlan): string {
  if (!plan.missing.length) {
    return `Restored "${plan.memoryName}" · ${plan.restored.length} windows`;
  }
  const names = plan.missing.map((id) => readableName(id)).join(', ');
  const plural = plan.missing.length > 1 ? 'were' : 'was';
  return `Restored "${plan.memoryName}". ${names} ${plural} unavailable.`;
}

/**
 * Turn a finished plan into the account the interface shows.
 *
 * Called by the command bus once it has run the plan's commands, so the report
 * describes what happened rather than what was intended.
 */
export function recordRestore(plan: RestorePlan): RestoreReport {
  const report: RestoreReport = {
    memoryId: plan.memoryId,
    memoryName: plan.memoryName,
    restored: plan.restored,
    missing: plan.missing,
    message: describe(plan),
    at: Date.now(),
  };
  useMemoryStore.getState().setLastReport(report);
  return report;
}

/** Load stored metadata into the interface. Called once, at startup. */
export function initMemory(): MemorySummary[] {
  return publish();
}
