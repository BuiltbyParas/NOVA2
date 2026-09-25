import type { SpatialMemory } from '../../types/memory';
import type { NovaCommandResponse } from '../../types/nova';
import { APPS } from '../../data/apps';
import { WORKSPACES } from '../../data/workspaces';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../command/commandBus';
import { executeIntent, translateIntent } from '../command/contextBridge';
import { memoryIntent, routeUtterance } from '../command/intentRouter';
import { buildContextGraph, getSpatialRelation } from '../context/contextGraph';
import * as engine from '../context/contextEngine';
import {
  clearMemories,
  deleteMemory,
  getMemory,
  listMemories,
  planRestore,
  saveCurrentAs,
} from './memoryManager';
import { InMemoryRepository, LocalStorageRepository, setRepository } from './memoryRepository';
import { resolveMemory } from './memoryResolver';
import { captureMemorySnapshot, createMemory, migrate, toContextSnapshot } from './memorySerializer';
import { useMemoryStore } from './memoryStore';

/**
 * Phase 5 verification.
 *
 * Two halves, deliberately. The first exercises serialization, resolution and
 * planning as pure functions against fixed data. The second drives the real
 * store through the real command bus, because "a memory restores the
 * arrangement" is a claim about the live system, not about a plan object.
 *
 * Persistence is checked against a stand-in `localStorage` rather than mocked
 * away: the point of Phase 5 is that a memory survives a reload, and a test
 * that never touches the storage API cannot tell you whether it does.
 */

let failures = 0;
let checks = 0;

function assert(condition: boolean, message: string) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

const pass = (message: string) => console.log(`✓ ${message}`);

console.log('\n=== NOVA Phase 5 · Spatial Memory ===\n');

// --- a minimal localStorage, so persistence is tested rather than assumed ----

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  /** Everything a reload keeps: the serialized bytes, nothing else. */
  snapshotBytes() {
    return new Map(this.data);
  }
  restoreBytes(bytes: Map<string, string>) {
    this.data = new Map(bytes);
  }
}

const storage = new FakeStorage();
(globalThis as unknown as { localStorage: FakeStorage }).localStorage = storage;

// --- fixtures ---------------------------------------------------------------

function developmentSnapshot(focused = 'code') {
  const apps = ['browser', 'code', 'terminal', 'notes', 'files'] as const;
  return {
    windows: apps.map((app) => {
      const placement = WORKSPACES.development.placements[app];
      const definition = APPS[app];
      return {
        id: app,
        app,
        title: definition.title,
        position: { ...placement.position },
        rotation: { ...placement.rotation },
        scale: placement.scale,
        width: definition.width,
        height: definition.height,
        focused: app === focused,
        minimized: false,
        lifecycle: 'settled' as const,
        lifecycleAt: 0,
      };
    }),
    order: [...apps],
    focusedId: focused,
    workspace: 'development' as const,
    activeTaskId: 'database-assignment',
    interactions: {},
    at: 1000,
  };
}

function memoryNamed(name: string, at: number): SpatialMemory {
  return createMemory(name, buildContextGraph(developmentSnapshot()), null, at);
}

// --- 1. serialization -------------------------------------------------------

console.log('--- Serialization ---');
{
  const graph = buildContextGraph(developmentSnapshot());
  const snapshot = captureMemorySnapshot(graph);

  assert(snapshot.workspace.id === 'development', 'the workspace is recorded');
  assert(snapshot.task?.id === 'database-assignment', 'the task is recorded');
  assert(snapshot.focusedWindow === 'code', 'the focused window is recorded');
  assert(snapshot.windows.length === 5, `all five windows are recorded, got ${snapshot.windows.length}`);
  assert(snapshot.relationships.length > 0, 'spatial relationships are recorded');

  const code = snapshot.windows.find((win) => win.id === 'code')!;
  const placement = WORKSPACES.development.placements.code;
  assert(code.position.x === placement.position.x, 'positions round-trip exactly');
  assert(code.scale === placement.scale, 'scale round-trips exactly');
  assert(code.rotation.y === placement.rotation.y, 'rotation round-trips exactly');

  const serialized = JSON.stringify(snapshot);
  assert(!serialized.includes('lifecycleAt'), 'animation clocks are not saved');
  assert(!serialized.includes('"width"'), 'intrinsic app dimensions are not saved');
  assert(!/camera|webgl|three|mesh/i.test(serialized), 'no rendering state is saved');
  pass('A context graph serializes to a memory, without transient or render state');

  // The Phase 4 promise made literal: a saved arrangement is a valid input to
  // the same graph builder that reads live state.
  const rebuilt = buildContextGraph(toContextSnapshot(snapshot));
  assert(rebuilt.workspace.id === 'development', 'a memory rebuilds into a context graph');
  assert(rebuilt.focusedId === 'code', 'focus survives the round trip');
  assert(
    getSpatialRelation(rebuilt, 'browser', 'code') === getSpatialRelation(graph, 'browser', 'code'),
    'relations derived from a memory match the ones derived from live state',
  );
  pass('A memory can be rebuilt into a graph and asked the same questions');
}

// --- 2. versioning and validation ------------------------------------------

console.log('--- Schema version ---');
{
  const memory = memoryNamed('Database Assignment', 1);
  assert(memory.metadata.version === 1, 'records carry a schema version');
  assert(memory.metadata.revision === 1, 'a new memory starts at revision 1');

  assert(migrate(JSON.parse(JSON.stringify(memory))) !== null, 'a valid record survives migration');
  assert(migrate(null) === null, 'null is rejected');
  assert(migrate({ id: 'x' }) === null, 'a record without a snapshot is rejected');
  assert(
    migrate({ ...memory, metadata: { ...memory.metadata, version: 99 } }) === null,
    'a record from a newer NOVA is rejected rather than misread',
  );
  const legacy = migrate({ ...memory, snapshot: { ...memory.snapshot, relationships: undefined } });
  assert(legacy?.snapshot.relationships.length === 0, 'a missing optional field is filled, not fatal');
  pass('Records are versioned, and unreadable storage is rejected rather than trusted');
}

// --- 3. persistence ---------------------------------------------------------

console.log('--- Persistence ---');
{
  setRepository(new LocalStorageRepository());
  clearMemories();

  const repository = new LocalStorageRepository();
  repository.save(memoryNamed('Database Assignment', 100));
  repository.save(memoryNamed('Frontend Development', 200));

  assert(repository.getAll().length === 2, 'both memories are stored');
  assert(repository.get(memoryNamed('Database Assignment', 100).id) !== null, 'a memory is retrievable by id');

  // Simulate a reload: keep only the bytes, throw away every object.
  const bytes = storage.snapshotBytes();
  storage.restoreBytes(new Map());
  assert(new LocalStorageRepository().getAll().length === 0, 'cleared storage really is empty');
  storage.restoreBytes(bytes);

  const afterReload = new LocalStorageRepository().getAll();
  assert(afterReload.length === 2, `memories survive a reload, got ${afterReload.length}`);
  assert(
    afterReload.some((memory) => memory.name === 'Database Assignment'),
    'the named arrangement is still there after the reload',
  );
  const restored = afterReload.find((memory) => memory.name === 'Database Assignment')!;
  assert(restored.snapshot.windows.length === 5, 'the arrangement itself survived, not just the name');
  assert(
    restored.snapshot.windows.find((win) => win.id === 'code')!.scale ===
      WORKSPACES.development.placements.code.scale,
    'window scale survived the reload byte-for-byte',
  );
  pass('Memories survive a reload, arrangement and all');

  storage.restoreBytes(new Map());
  assert(new LocalStorageRepository().getAll().length === 0, 'clear leaves nothing behind');

  // Corrupt storage must not take NOVA down.
  storage.setItem('nova.memories.v1', '{ not json');
  assert(new LocalStorageRepository().getAll().length === 0, 'malformed storage reads as empty');
  storage.restoreBytes(new Map());
  pass('Malformed storage is survivable');
}

// --- 4. resolution ----------------------------------------------------------

console.log('--- Memory resolution ---');
{
  const memories = [
    memoryNamed('Database Assignment', 300),
    memoryNamed('Database Project', 200),
    memoryNamed('Frontend Development', 100),
  ];

  const exact = resolveMemory('Database Assignment', memories);
  assert(
    exact.status === 'resolved' && exact.memory.name === 'Database Assignment',
    `an exact name resolves, got ${JSON.stringify(exact.status)}`,
  );

  const phrased = resolveMemory('restore database assignment', memories);
  assert(
    phrased.status === 'resolved' && phrased.memory.name === 'Database Assignment',
    'a name wrapped in a sentence still resolves',
  );

  const frontend = resolveMemory('continue my frontend work', memories);
  assert(
    frontend.status === 'resolved' && frontend.memory.name === 'Frontend Development',
    'a single plausible match resolves',
  );

  // The case from the brief: two memories are equally about "database work".
  const ambiguous = resolveMemory('continue my database work', memories);
  assert(ambiguous.status === 'ambiguous', `two database memories should be ambiguous, got ${ambiguous.status}`);
  if (ambiguous.status === 'ambiguous') {
    assert(ambiguous.candidates.length === 2, `both candidates offered, got ${ambiguous.candidates.length}`);
    assert(
      ambiguous.candidates.every((match) => match.memory.name.startsWith('Database')),
      'the candidates are the two database memories',
    );
    assert(/which|did you mean/i.test(ambiguous.question), 'the question can be put to the user');
  }

  const unknown = resolveMemory('continue my astrophysics work', memories);
  assert(unknown.status === 'unresolved', 'an unmatched phrase is unresolved, not guessed');

  const nothing = resolveMemory('anything', []);
  assert(nothing.status === 'unresolved', 'with nothing saved, there is nothing to resolve');

  // "Where I left off" names nothing, and means the most recent.
  const recent = resolveMemory('continue where I left off', memories);
  assert(
    recent.status === 'resolved' && recent.memory.name === 'Database Assignment',
    `"where I left off" should resolve to the newest memory, got ${JSON.stringify(recent)}`,
  );

  // Context is a tie-breaker, never a vote that outweighs the words.
  const biased = resolveMemory('continue my database work', memories, {
    workspace: 'development',
    task: 'database-assignment',
  });
  assert(
    biased.status === 'ambiguous',
    'matching workspace context must not break a genuine tie between names',
  );
  pass('Memories resolve by name, by recency, and refuse to guess between rivals');
}

// --- 5. restore planning ----------------------------------------------------

console.log('--- Restore planning ---');
{
  const memory = memoryNamed('Database Assignment', 400);
  const all = new Set(['browser', 'code', 'terminal', 'notes', 'files']);
  const plan = planRestore(memory, all);

  assert(plan.commands[0].action === 'workspace', 'a restore starts by applying the workspace');
  assert(plan.commands[1].action === 'task', 'then the task');
  assert(plan.commands[plan.commands.length - 1].action === 'focus', 'and ends by restoring focus');
  assert(plan.missing.length === 0, 'nothing is missing when every window is present');
  assert(plan.restored.length === 5, `all five windows are restored, got ${plan.restored.length}`);

  const actions = new Set(plan.commands.map((command) => command.action));
  for (const action of ['workspace', 'task', 'move', 'scale', 'rotate', 'focus']) {
    assert(actions.has(action as never), `the plan uses the existing "${action}" command`);
  }
  assert(
    plan.commands.every((command) => !('mesh' in command) && !('object3d' in command)),
    'a plan contains commands only — never scene objects',
  );
  pass('A restore is an ordered list of commands the bus already had');

  // The §11 case: a window in the memory no longer exists.
  const without = planRestore(memory, new Set(['browser', 'code']));
  assert(without.restored.length === 2, 'present windows are still restored');
  assert(
    JSON.stringify(without.missing.sort()) === JSON.stringify(['files', 'notes', 'terminal']),
    `the absent windows are reported, got ${without.missing.join(',')}`,
  );
  assert(
    without.commands.every(
      (command) => !('target' in command) || !['terminal', 'notes', 'files'].includes(String(command.target)),
    ),
    'no command is emitted for a window that is not there',
  );

  // Focus falls back safely when the remembered focus is gone.
  const focusGone = planRestore(memory, new Set(['browser']));
  assert(
    focusGone.commands[focusGone.commands.length - 1].action === 'blur',
    'with the focused window missing, focus is cleared rather than guessed',
  );
  pass('A missing window is skipped and reported, and never crashes the restore');
}

// --- 6. the live system -----------------------------------------------------

console.log('--- Live restore through the command bus ---');
{
  setRepository(new InMemoryRepository());
  const stop = engine.startContextEngine();
  engine.resetContextEngine();
  clearMemories();

  // STEP 1 — arrange something worth remembering.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'task', target: 'database-assignment' }, 'system');
  dispatch({ action: 'move', target: 'browser', position: { x: -2.5, y: 0.8, z: -0.5 } }, 'system');
  dispatch({ action: 'scale', target: 'browser', scale: 1.1 }, 'system');
  dispatch({ action: 'rotate', target: 'terminal', rotation: { x: 0.05, y: -0.2, z: 0 } }, 'system');
  dispatch({ action: 'minimize', target: 'files' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');

  const wanted = {
    browser: { ...engine.getWindowContext('browser')! },
    code: { ...engine.getWindowContext('code')! },
    terminal: { ...engine.getWindowContext('terminal')! },
    notes: { ...engine.getWindowContext('notes')! },
  };
  const wantedRelation = engine.getSpatialRelation('browser', 'code');

  // STEP 2 — "Save this as my database workspace."
  const saved = await routeUtterance('save this as my database workspace');
  assert(saved.via === 'memory', `a save is read as a memory instruction, got ${saved.via}`);
  assert(listMemories().length === 1, `one memory should be stored, got ${listMemories().length}`);
  const memory = listMemories()[0];
  assert(memory.name === 'database workspace', `the name is taken from the sentence, got "${memory.name}"`);
  assert(memory.snapshot.workspace.id === 'development', 'the memory captured the workspace');
  assert(memory.snapshot.task?.id === 'database-assignment', 'the memory captured the task');
  assert(memory.snapshot.focusedWindow === 'code', 'the memory captured focus');
  assert(
    memory.snapshot.windows.find((win) => win.id === 'files')!.minimized === true,
    'the memory captured visibility',
  );
  assert(useMemoryStore.getState().summaries.length === 1, 'the interface can see the new memory');
  pass('"Save this as my database workspace" stored the arrangement');

  // STEP 3 — disturb everything.
  dispatch({ action: 'workspace', target: 'study' }, 'system');
  dispatch({ action: 'task', target: 'nova-build' }, 'system');
  dispatch({ action: 'move', target: 'browser', position: { x: 3.9, y: -1.9, z: -2.4 } }, 'system');
  dispatch({ action: 'scale', target: 'browser', scale: 0.6 }, 'system');
  dispatch({ action: 'restore', target: 'files' }, 'system');
  dispatch({ action: 'focus', target: 'notes' }, 'system');

  assert(engine.getCurrentContext().workspace.id === 'study', 'the environment really did change');
  assert(engine.getFocusedWindow()?.id === 'notes', 'focus really did change');
  assert(engine.getWindowContext('files')!.minimized === false, 'visibility really did change');

  // STEP 4 — "Continue my database work."
  const continued = await routeUtterance('continue my database work');
  assert(continued.via === 'memory', 'a restore is read as a memory instruction');
  assert(continued.clarification === null, `one memory matches, so no question, got ${JSON.stringify(continued.clarification)}`);

  // STEP 5 — everything comes back.
  assert(engine.getCurrentContext().workspace.id === 'development', 'the workspace was restored');
  assert(engine.getCurrentContext().task?.id === 'database-assignment', 'the task was restored');
  assert(engine.getFocusedWindow()?.id === 'code', 'focus was restored');
  assert(engine.getWindowContext('files')!.minimized === true, 'visibility was restored');

  for (const id of ['browser', 'code', 'terminal', 'notes'] as const) {
    const now = engine.getWindowContext(id)!;
    const then = wanted[id];
    assert(
      Math.abs(now.position.x - then.position.x) < 0.001 &&
        Math.abs(now.position.y - then.position.y) < 0.001 &&
        Math.abs(now.position.z - then.position.z) < 0.001,
      `${id} position restored (${JSON.stringify(then.position)} → ${JSON.stringify(now.position)})`,
    );
    assert(Math.abs(now.scale - then.scale) < 0.001, `${id} scale restored (${then.scale} → ${now.scale})`);
    assert(
      Math.abs(now.rotation.y - then.rotation.y) < 0.001,
      `${id} rotation restored (${then.rotation.y} → ${now.rotation.y})`,
    );
  }
  assert(
    engine.getSpatialRelation('browser', 'code') === wantedRelation,
    `the spatial relationship was restored (${wantedRelation} → ${engine.getSpatialRelation('browser', 'code')})`,
  );
  pass('"Continue my database work" restored workspace, task, focus, transforms and relations');

  // STEP 6 — a window that no longer exists.
  useSpatialStore.getState().removeWindow('terminal');
  engine.resetContextEngine();
  dispatch({ action: 'memory-restore', id: memory.id }, 'system');
  // Read the state *after* the dispatch: zustand replaces the state object
  // rather than mutating it, so a reference taken beforehand stays stale.
  const after = useMemoryStore.getState().lastReport!;
  assert(after.missing.includes('terminal'), 'the unavailable window is reported');
  assert(!after.restored.includes('terminal'), 'and is not claimed as restored');
  assert(after.restored.includes('code'), 'everything else still came back');
  assert(/terminal/i.test(after.message), `the message names it: "${after.message}"`);
  assert(/unavailable/i.test(after.message), 'and says it was unavailable');
  assert(engine.getWindowContext('code')!.position.x === wanted.code.position.x, 'the rest of the arrangement is intact');
  pass(`Restoring with a window gone: "${after.message}"`);

  // Saving the same name twice updates one memory rather than making a rival.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  saveCurrentAs('database workspace');
  assert(listMemories().length === 1, `saving over a name keeps one memory, got ${listMemories().length}`);
  assert(getMemory(memory.id)!.metadata.revision === 2, 'and increments its revision');
  pass('Saving under an existing name updates it rather than manufacturing ambiguity');

  stop();
}

// --- 7. memory commands through the intent layer ----------------------------

console.log('--- Memory intents ---');
{
  setRepository(new InMemoryRepository());
  const stop = engine.startContextEngine();
  clearMemories();

  assert(memoryIntent('save this as Database')?.commands[0].action === 'SAVE_MEMORY', '"save this as X" is a save');
  assert(memoryIntent('remember this setup')?.commands[0].action === 'SAVE_MEMORY', '"remember this setup" is a save');
  assert(
    memoryIntent('show my saved workspaces')?.commands[0].action === 'LIST_MEMORIES',
    '"show my saved workspaces" is a list',
  );
  assert(
    memoryIntent('delete my old coding workspace')?.commands[0].action === 'DELETE_MEMORY',
    '"delete my old coding workspace" is a delete',
  );
  assert(
    memoryIntent('restore my coding setup')?.commands[0].action === 'RESTORE_MEMORY',
    '"restore my coding setup" is a restore',
  );
  assert(memoryIntent('move this beside the browser') === null, 'a spatial instruction is not a memory instruction');
  assert(memoryIntent('focus code') === null, 'an ordinary command is left alone');
  pass('Memory phrasings are recognised, and ordinary commands are not stolen');

  // Saving without a name asks rather than inventing one.
  const unnamed = translateIntent(engine.getCurrentContext(), {
    status: 'ok',
    commands: [{ action: 'SAVE_MEMORY', target: '' }],
  });
  assert(unnamed.clarification !== null, 'a memory with no name produces a question');
  assert(unnamed.commands.length === 0, 'and saves nothing');

  // Ambiguity travels all the way through the bridge, carrying its verb.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  saveCurrentAs('Database Assignment');
  saveCurrentAs('Database Project');
  const ask = await routeUtterance('continue my database work');
  assert(ask.clarification !== null, 'two rival memories produce a question');
  assert(ask.commands.length === 0, 'and nothing is restored while it is open');
  assert(
    ask.clarification?.pendingAction === 'memory-restore',
    `the question remembers it was a restore, got ${ask.clarification?.pendingAction}`,
  );
  assert(ask.clarification?.candidates.length === 2, 'both memories are offered');

  // Answering it is a single command, exactly as the command line sends.
  const chosen = ask.clarification!.candidates.find((c) => c.name === 'Database Project')!;
  dispatch({ action: 'memory-restore', id: chosen.id }, 'system');
  assert(
    useMemoryStore.getState().lastReport?.memoryName === 'Database Project',
    'answering the question restored the chosen memory',
  );
  pass('An ambiguous memory query asks, and the answer restores exactly one');

  // Delete, through the same path.
  const before = listMemories().length;
  const deleted = await routeUtterance('delete the Database Project workspace');
  assert(deleted.via === 'memory', 'a delete is read as a memory instruction');
  assert(listMemories().length === before - 1, `one memory was deleted, ${before} → ${listMemories().length}`);
  assert(!listMemories().some((m) => m.name === 'Database Project'), 'and it was the right one');
  assert(deleteMemory('does-not-exist') === false, 'deleting something absent is a no-op, not a crash');
  pass('Deleting a memory works through the command bus');

  // A model reply that is not "ok" must never reach the memory layer.
  const refused: NovaCommandResponse = {
    status: 'unsupported',
    commands: [{ action: 'DELETE_MEMORY', target: 'Database Assignment' }],
    message: 'That capability is not currently supported by NOVA.',
  };
  const countBefore = listMemories().length;
  executeIntent(engine.getCurrentContext(), refused);
  assert(listMemories().length === countBefore, 'a non-ok intent deletes nothing');
  pass('Only an "ok" intent can reach the memory layer');

  stop();
  clearMemories();
}

// --- 8. the model's view ----------------------------------------------------

console.log('--- Gemini handoff ---');
{
  setRepository(new InMemoryRepository());
  const stop = engine.startContextEngine();
  clearMemories();
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  saveCurrentAs('Database Assignment');

  engine.setSavedMemoryReader(() =>
    listMemories().map((memory) => ({
      id: memory.id,
      name: memory.name,
      workspace: memory.snapshot.workspace.id,
    })),
  );

  const context = engine.buildGeminiContext();
  const serialized = JSON.stringify(context);

  assert(context.savedMemories?.length === 1, 'the model is told what has been saved');
  assert(context.savedMemories?.[0].name === 'Database Assignment', 'by name');
  assert(!serialized.includes('"position"'), 'but never the arrangements themselves');
  assert(!/"x":/.test(serialized), 'and never coordinates');
  assert(!/relationships/.test(serialized), 'and not a stored relationship table');
  assert(serialized.length < 5000, `the payload stays compact, got ${serialized.length} characters`);
  pass('Gemini learns which memories exist, and nothing about what is inside them');

  engine.setSavedMemoryReader(() => []);
  stop();
  clearMemories();
}

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} memory assertions FAILED`);
}
console.log(`ALL ${checks} MEMORY ASSERTIONS PASSED! 🎉`);
console.log('========================================');
