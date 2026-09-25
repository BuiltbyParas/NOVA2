import type { SpatialWindow, AppType } from '../../types/window';
import type { WorkspaceId } from '../../types/workspace';
import type { NovaCommandResponse } from '../../types/nova';
import { APPS } from '../../data/apps';
import { WORKSPACES } from '../../data/workspaces';
import { buildContextGraph, buildGeminiContext, getRelatedWindows, getSpatialRelation, getWindowsForTask, type ContextSnapshot } from './contextGraph';
import { resolveReference } from './referenceResolver';
import { axisRelation, isBeside } from './spatialRelations';
import { dispatch } from '../command/commandBus';
import { useSpatialStore } from '../../state/spatialStore';
import * as engine from './contextEngine';
import { executeIntent, resolveWorkingSet, translateIntent } from '../command/contextBridge';
import { localIntent, routeUtterance } from '../command/intentRouter';

/**
 * Phase 4 verification.
 *
 * Deterministic throughout: the graph builder is pure, so every reasoning test
 * runs against fixed fixture coordinates rather than whatever the app happens
 * to be doing. The final section drives the real store through the real command
 * bus, because "the context engine is connected" is a claim that has to be
 * checked against the live architecture, not a mock of it.
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

function pass(message: string) {
  console.log(`✓ ${message}`);
}

// --- fixtures ----------------------------------------------------------------

function makeWindow(
  app: AppType,
  position: { x: number; y: number; z: number },
  scale: number,
  focused = false,
  minimized = false,
): SpatialWindow {
  const definition = APPS[app];
  return {
    id: app,
    app,
    title: definition.title,
    position,
    rotation: { x: 0, y: 0, z: 0 },
    scale,
    width: definition.width,
    height: definition.height,
    focused,
    minimized,
    lifecycle: 'settled',
    lifecycleAt: 0,
  };
}

/** The Development arrangement, taken from the real workspace layout. */
function developmentWindows(only?: AppType[]): SpatialWindow[] {
  const apps: AppType[] = only ?? ['browser', 'code', 'terminal', 'notes', 'files'];
  return apps.map((app) => {
    const placement = WORKSPACES.development.placements[app];
    return makeWindow(app, { ...placement.position }, placement.scale, app === 'code');
  });
}

function snapshotOf(
  windows: SpatialWindow[],
  overrides: Partial<ContextSnapshot> = {},
): ContextSnapshot {
  return {
    windows,
    order: windows.map((win) => win.id),
    focusedId: windows.find((win) => win.focused)?.id ?? null,
    workspace: 'development' as WorkspaceId,
    activeTaskId: 'nova-build',
    interactions: {},
    at: 1000,
    ...overrides,
  };
}

console.log('\n=== NOVA Phase 4 · Spatial Context Engine ===\n');

// --- 1. workspace resolution -------------------------------------------------

console.log('--- Workspace context ---');
{
  const graph = buildContextGraph(snapshotOf(developmentWindows()));
  assert(graph.workspace.id === 'development', `workspace should be development, got ${graph.workspace.id}`);
  assert(graph.workspace.name === 'Development', 'workspace name should come from the workspace definition');
  assert(graph.workspace.windowIds.length === 5, `workspace should contain 5 windows, got ${graph.workspace.windowIds.length}`);
  assert(getSpatialRelation(graph, 'development', 'code') === 'contains', 'a workspace contains its windows');
  pass('Current workspace resolves, and reports containment');
}

// --- 2. focused window resolution --------------------------------------------

console.log('--- Focus ---');
{
  const graph = buildContextGraph(snapshotOf(developmentWindows()));
  assert(graph.focusedId === 'code', `focused window should be code, got ${graph.focusedId}`);
  assert(graph.byId.code.focused === true, 'the focused window carries focused: true');

  const blurred = buildContextGraph(snapshotOf(developmentWindows().map((w) => ({ ...w, focused: false })), { focusedId: null }));
  assert(blurred.focusedId === null, 'focus resolves to null when nothing is focused');
  pass('Focused window resolves, including the unfocused case');
}

// --- 3. spatial relationship resolution --------------------------------------

console.log('--- Spatial relationships ---');
{
  const graph = buildContextGraph(snapshotOf(developmentWindows()));

  assert(getSpatialRelation(graph, 'browser', 'code') === 'left', 'browser sits left of code in Development');
  assert(getSpatialRelation(graph, 'terminal', 'code') === 'right', 'terminal sits right of code in Development');
  assert(getSpatialRelation(graph, 'code', 'browser') === 'right', 'the relation inverts when read the other way');
  assert(getSpatialRelation(graph, 'code', 'code') === null, 'a window has no relation to itself');

  // A vertical pair, constructed so the dominant axis is unambiguous.
  const stacked = buildContextGraph(
    snapshotOf([
      makeWindow('code', { x: 0, y: 1.2, z: 0 }, 1, true),
      makeWindow('terminal', { x: 0, y: -1.4, z: 0 }, 0.9),
    ]),
  );
  assert(getSpatialRelation(stacked, 'code', 'terminal') === 'above', 'code above terminal');
  assert(getSpatialRelation(stacked, 'terminal', 'code') === 'below', 'terminal below code');

  // Depth: +z is toward the user.
  const layered = buildContextGraph(
    snapshotOf([
      makeWindow('code', { x: 0, y: 0, z: 1.2 }, 1, true),
      makeWindow('browser', { x: 0, y: 0, z: -1.6 }, 1),
    ]),
  );
  assert(getSpatialRelation(layered, 'code', 'browser') === 'front', 'a larger z reads as in front');
  assert(getSpatialRelation(layered, 'browser', 'code') === 'behind', 'a smaller z reads as behind');

  // Adjacency outranks the axis reading.
  const side = buildContextGraph(
    snapshotOf([
      makeWindow('code', { x: 1.6, y: 0, z: 0 }, 1, true),
      makeWindow('browser', { x: -1.6, y: 0, z: 0 }, 1),
    ]),
  );
  assert(getSpatialRelation(side, 'code', 'browser') === 'beside', 'touching surfaces read as beside, not merely right');

  // Strength distinguishes a clean reading from a diagonal one.
  const clean = axisRelation(
    { id: 'a', position: { x: 3, y: 0, z: 0 }, width: 1, height: 1, scale: 1 },
    { id: 'b', position: { x: 0, y: 0, z: 0 }, width: 1, height: 1, scale: 1 },
  );
  const diagonal = axisRelation(
    { id: 'a', position: { x: 3, y: 2.8, z: 0 }, width: 1, height: 1, scale: 1 },
    { id: 'b', position: { x: 0, y: 0, z: 0 }, width: 1, height: 1, scale: 1 },
  );
  assert(clean!.strength === 1, `a pure horizontal offset should score 1, got ${clean!.strength}`);
  assert(diagonal!.strength < 0.6, `a diagonal offset should score low, got ${diagonal!.strength}`);
  pass('Relations derive from geometry on every axis, with adjacency outranking it');
}

// --- 4. task relationships ---------------------------------------------------

console.log('--- Task context ---');
{
  const graph = buildContextGraph(snapshotOf(developmentWindows()));
  assert(graph.task?.id === 'nova-build', `active task should be nova-build, got ${graph.task?.id}`);
  assert(graph.byId.code.taskId === 'nova-build', 'code belongs to the active task');
  assert(graph.byId.files.taskId !== 'nova-build', 'files is not part of the NOVA build task');

  const taskWindows = getWindowsForTask(graph, 'nova-build').map((win) => win.id).sort();
  assert(
    JSON.stringify(taskWindows) === JSON.stringify(['browser', 'code', 'notes', 'terminal']),
    `nova-build should hold browser/code/notes/terminal, got ${taskWindows.join(',')}`,
  );

  const related = getRelatedWindows(graph, 'code').map((win) => win.id);
  assert(related.includes('terminal') && related.includes('browser'), 'task members are related to one another');
  assert(!related.includes('files'), 'a window outside the task is not reported as related');
  assert(graph.byId.code.semanticRole === 'implementation', 'code means implementation');
  assert(graph.byId.browser.semanticRole === 'documentation', 'browser means documentation');
  assert(getSpatialRelation(graph, 'nova-build', 'terminal') === 'contains', 'a task contains its windows');
  pass('Tasks associate windows, carry semantic roles, and report containment');
}

// --- 5, 6. "this" and "that" -------------------------------------------------

console.log('--- Contextual references ---');
{
  const graph = buildContextGraph(snapshotOf(developmentWindows()));

  for (const word of ['this', 'that', 'it', 'this one', 'the window']) {
    const resolution = resolveReference(graph, word);
    assert(
      resolution.status === 'resolved' && resolution.windowId === 'code',
      `"${word}" should resolve to the focused window, got ${JSON.stringify(resolution)}`,
    );
  }
  pass('"this" / "that" / "it" resolve through focus');

  // With nothing focused, recency answers instead.
  const unfocused = developmentWindows().map((win) => ({ ...win, focused: false }));
  const byRecency = buildContextGraph(
    snapshotOf(unfocused, { focusedId: null, interactions: { terminal: 900, browser: 400 } }),
  );
  const recent = resolveReference(byRecency, 'it');
  assert(
    recent.status === 'resolved' && recent.windowId === 'terminal' && recent.via === 'recent',
    `with no focus, "it" should fall back to the most recent window, got ${JSON.stringify(recent)}`,
  );
  pass('With nothing focused, "it" falls back to the most recently touched window');

  // Named references and roles.
  const named = resolveReference(graph, 'the terminal related to this task');
  assert(named.status === 'resolved' && named.windowId === 'terminal', 'an explicit name wins over a pronoun');
  const byRole = resolveReference(graph, 'the docs');
  assert(byRole.status === 'resolved' && byRole.windowId === 'browser', 'a semantic role resolves to its window');
  pass('Named windows and semantic roles resolve');
}

// --- 7. "the one on the right" ----------------------------------------------

console.log('--- Spatial references ---');
{
  const three = buildContextGraph(snapshotOf(developmentWindows(['browser', 'code', 'terminal'])));
  const right = resolveReference(three, 'the one on the right');
  assert(
    right.status === 'resolved' && right.windowId === 'terminal',
    `"the one on the right" should resolve to terminal, got ${JSON.stringify(right)}`,
  );
  const left = resolveReference(three, 'the one on the left');
  assert(left.status === 'resolved' && left.windowId === 'browser', '"the one on the left" resolves to browser');

  const anchored = resolveReference(three, 'right of code');
  assert(
    anchored.status === 'resolved' && anchored.windowId === 'terminal',
    `"right of code" should resolve to terminal, got ${JSON.stringify(anchored)}`,
  );
  pass('"the one on the right" resolves, with and without an explicit anchor');
}

// --- 8. ambiguity ------------------------------------------------------------

console.log('--- Ambiguity ---');
{
  // Terminal (x 2.88) and Notes (x 2.70) are 0.18 units apart. No honest answer.
  const crowded = buildContextGraph(snapshotOf(developmentWindows()));
  const right = resolveReference(crowded, 'the one on the right');
  assert(right.status === 'ambiguous', `two near-equal candidates should be ambiguous, got ${right.status}`);
  if (right.status === 'ambiguous') {
    const ids = right.candidates.map((c) => c.id).sort();
    assert(
      JSON.stringify(ids) === JSON.stringify(['notes', 'terminal']),
      `candidates should be notes and terminal, got ${ids.join(',')}`,
    );
    assert(right.question.length > 0, 'an ambiguous result carries a question for the user');
  }

  // Nothing focused, nothing touched: "make it bigger" has no referent.
  const cold = buildContextGraph(
    snapshotOf(developmentWindows().map((w) => ({ ...w, focused: false })), { focusedId: null, order: [] }),
  );
  const it = resolveReference(cold, 'it');
  assert(it.status === 'ambiguous', `"it" with no focus and no history should be ambiguous, got ${it.status}`);

  const nonsense = resolveReference(crowded, 'the spreadsheet');
  assert(nonsense.status === 'unresolved', 'an unknown referent is unresolved, not guessed');
  pass('Equally plausible targets produce a question rather than a guess');
}

// --- 9. Gemini context -------------------------------------------------------

console.log('--- Gemini handoff ---');
{
  const graph = buildContextGraph(snapshotOf(developmentWindows()));
  const context = buildGeminiContext(graph);
  const serialized = JSON.stringify(context);

  assert(context.workspace === 'development', 'the model is told which workspace is current');
  assert(context.focusedWindow === 'code', 'the model is told what is focused');
  assert(context.task === 'nova-build', 'the model is told what the arrangement is for');
  assert(context.windows.length === 5, `all five windows are described, got ${context.windows.length}`);

  const browser = context.windows.find((win) => win.id === 'browser')!;
  assert(browser.semanticRole === 'documentation', 'each window carries its meaning');
  assert(browser.relations.some((r) => r === 'left:code'), `relations are semantic strings, got ${browser.relations.join(',')}`);

  assert(!serialized.includes('"position"'), 'no coordinates are sent to the model');
  assert(!serialized.includes('rotation'), 'no rotations are sent to the model');
  assert(!/"x":/.test(serialized), 'no raw world units are sent to the model');
  assert(serialized.length < 4000, `the context stays compact, got ${serialized.length} characters`);
  pass('Gemini receives compact, semantic context with no scene detail');
}

// --- 10, 11, 12 + acceptance: the live system --------------------------------

console.log('--- Live command bus integration ---');
{
  const stop = engine.startContextEngine();
  engine.resetContextEngine();

  dispatch({ action: 'workspace', target: 'development' }, 'system');
  assert(engine.getCurrentContext().workspace.id === 'development', 'switching workspace updates context');
  assert(engine.getCurrentContext().task?.id === 'nova-build', 'entering a workspace enters its task');
  pass('Context updates after a workspace switch');

  dispatch({ action: 'focus', target: 'code' }, 'system');
  assert(engine.getFocusedWindow()?.id === 'code', 'focusing a window updates the focused context');
  assert(engine.getRecentContext()[0]?.id === 'code', 'a focus counts as an interaction');
  pass('Context updates after FOCUS');

  const before = engine.getWindowContext('browser')!.position.x;
  dispatch({ action: 'move', target: 'browser', delta: { x: 0.6 } }, 'system');
  const after = engine.getWindowContext('browser')!.position.x;
  assert(Math.abs(after - (before + 0.6)) < 0.001, `MOVE should be reflected in context, ${before} → ${after}`);
  assert(engine.getRecentContext()[0]?.id === 'browser', 'a move counts as an interaction');
  pass('Context updates after MOVE');

  // --- the acceptance sequence ---
  console.log('--- Acceptance sequence ---');
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');

  const deictic = engine.resolveReference('this');
  assert(deictic.status === 'resolved' && deictic.windowId === 'code', '"this" resolves to Code');

  // "Move this beside the browser."
  const moveIntent: NovaCommandResponse = {
    status: 'ok',
    commands: [
      { action: 'MOVE', target: 'this', parameters: { relation: 'beside', relativeTo: 'browser' } },
    ],
  };
  const translated = translateIntent(engine.getCurrentContext(), moveIntent);
  assert(translated.clarification === null, 'a clear instruction needs no clarification');
  assert(translated.commands.length === 1, `one command expected, got ${translated.commands.length}`);
  const command = translated.commands[0];
  assert(command.action === 'move', 'the intent becomes a move command');
  assert(
    command.action === 'move' && command.reference === 'browser',
    'the move is expressed relative to the browser, not in coordinates',
  );
  assert(
    command.action === 'move' && (command.relation === 'left_of' || command.relation === 'right_of'),
    'NOVA chooses the side; "beside" never reaches the command bus',
  );

  executeIntent(engine.getCurrentContext(), moveIntent);
  assert(
    engine.getSpatialRelation('code', 'browser') === 'beside',
    `after the move, Code should read as beside Browser, got ${engine.getSpatialRelation('code', 'browser')}`,
  );
  assert(
    engine.getSpatialRelation('browser', 'code') === 'beside',
    'the relation holds in both directions',
  );
  pass('"Move this beside the browser" → MOVE(code, beside, browser) → context reflects it');

  // "Make it bigger."
  const scaleBefore = engine.getWindowContext('code')!.scale;
  const resizeIntent: NovaCommandResponse = {
    status: 'ok',
    commands: [{ action: 'RESIZE', target: 'it', parameters: { scaleMultiplier: 1.2 } }],
  };
  const resize = translateIntent(engine.getCurrentContext(), resizeIntent);
  assert(
    resize.commands[0]?.action === 'scale' && resize.commands[0].target === 'code',
    `"it" should resolve to code, got ${JSON.stringify(resize.commands[0])}`,
  );
  executeIntent(engine.getCurrentContext(), resizeIntent);
  assert(
    engine.getWindowContext('code')!.scale > scaleBefore,
    `code should be larger, ${scaleBefore} → ${engine.getWindowContext('code')!.scale}`,
  );
  pass('"Make it bigger" → "it" resolves to the most recent object and RESIZE applies');

  // "Switch to Study."
  executeIntent(engine.getCurrentContext(), {
    status: 'ok',
    commands: [{ action: 'SWITCH_WORKSPACE', target: 'study' }],
  });
  assert(engine.getCurrentContext().workspace.id === 'study', 'the workspace becomes Study');
  assert(
    engine.getCurrentContext().task?.id === 'database-assignment',
    `Study should carry the database assignment, got ${engine.getCurrentContext().task?.id}`,
  );
  pass('"Switch to Study" → workspace and task context both follow');

  // "Show me everything related to my database work."
  const working = resolveWorkingSet(engine.getCurrentContext(), 'everything related to my database work');
  assert(working.clarification === null, 'a known task needs no clarification');
  assert(working.highlighted.length >= 4, `the database task should gather its windows, got ${working.highlighted.join(',')}`);
  assert(working.commands.length === 0, 'answering a question about context moves nothing');
  pass('"Show me everything related to my database work" identifies the working set without acting');

  // With nothing focused, a pronoun still has an answer: the store's own focus
  // order is interaction history, so "that" means whatever was last worked in.
  dispatch({ action: 'focus', target: 'notes' }, 'system');
  dispatch({ action: 'blur' }, 'system');
  const afterBlur = engine.resolveReference('that');
  assert(
    afterBlur.status === 'resolved' && afterBlur.windowId === 'notes',
    `after blurring, "that" should still mean the last window worked in, got ${JSON.stringify(afterBlur)}`,
  );
  pass('After a blur, a pronoun falls back to interaction history rather than failing');

  // A cold world — nothing focused and nothing ever touched — must ask.
  const coldGraph = buildContextGraph(
    snapshotOf(developmentWindows().map((w) => ({ ...w, focused: false })), {
      focusedId: null,
      order: [],
    }),
  );
  const cold = translateIntent(coldGraph, {
    status: 'ok',
    commands: [{ action: 'RESIZE', target: 'that', parameters: { scaleMultiplier: 1.2 } }],
  });
  assert(cold.clarification !== null, 'with no focus and no history, NOVA asks which window');
  assert(cold.commands.length === 0, 'nothing is executed while a reference is unresolved');
  assert(
    (cold.clarification?.candidates.length ?? 0) > 1,
    'the question names the windows it could have meant',
  );
  pass('An unresolvable reference produces a question, not a guess');

  // A model reply that is not "ok" must never reach the bus.
  const refused = translateIntent(coldGraph, {
    status: 'unsupported',
    commands: [{ action: 'MOVE', target: 'code', parameters: { relation: 'left' } }],
    message: 'That capability is not currently supported by NOVA.',
  });
  assert(refused.commands.length === 0, 'commands attached to a non-ok response are discarded');
  pass('Only an "ok" intent can produce commands');

  stop();
  useSpatialStore.getState().focusWindow(null);
}

// --- the live language path --------------------------------------------------

console.log('--- Utterance routing ---');
{
  const stop = engine.startContextEngine();
  engine.resetContextEngine();
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');

  const graph = engine.getCurrentContext();

  const move = localIntent('move this beside the browser', graph)!;
  assert(move?.commands[0]?.action === 'MOVE', 'a relational instruction reads as MOVE');
  assert(move.commands[0].parameters?.relation === 'beside', 'the relation survives as "beside"');
  assert(
    String(move.commands[0].parameters?.relativeTo).includes('browser'),
    `the reference should be the browser, got ${move.commands[0].parameters?.relativeTo}`,
  );
  assert(move.commands[0].target === 'this', `the subject stays a reference, got ${move.commands[0].target}`);

  const bigger = localIntent('make it bigger', graph)!;
  assert(bigger?.commands[0]?.action === 'RESIZE', '"make it bigger" reads as RESIZE');
  assert(bigger.commands[0].parameters?.scaleMultiplier === 1.2, 'plain "bigger" is 1.2');
  assert(
    localIntent('make it much bigger', graph)!.commands[0].parameters?.scaleMultiplier === 1.4,
    '"much bigger" is stronger than "bigger"',
  );
  pass('Utterances read as structured intent, with references left unresolved');

  // Phase 1 phrasings must keep behaving exactly as they did.
  await routeUtterance('focus terminal');
  assert(engine.getFocusedWindow()?.id === 'terminal', 'the Phase 1 matcher still handles "focus terminal"');
  const phase1 = await routeUtterance('minimize terminal');
  assert(phase1.via === 'phase1', `a Phase 1 phrase should not need context, got ${phase1.via}`);
  assert(engine.getWindowContext('terminal')?.minimized === true, 'minimize still works');
  dispatch({ action: 'restore', target: 'terminal' }, 'system');
  pass('Phase 1 and Phase 2 language keeps its exact behaviour');

  // The full acceptance sentence, through the real command line path.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');
  const routed = await routeUtterance('move this beside the browser');
  assert(routed.via === 'context', `a contextual sentence should take the context path, got ${routed.via}`);
  assert(routed.clarification === null, 'the sentence is unambiguous');
  assert(
    engine.getSpatialRelation('code', 'browser') === 'beside',
    'the utterance moved Code beside Browser through the command bus',
  );

  const scaleBefore = engine.getWindowContext('code')!.scale;
  await routeUtterance('make it bigger');
  assert(engine.getWindowContext('code')!.scale > scaleBefore, '"make it bigger" enlarged Code');

  await routeUtterance('switch to study');
  assert(engine.getCurrentContext().workspace.id === 'study', '"switch to study" changed workspace');
  pass('The command line drives the acceptance sequence end to end');

  // A genuinely ambiguous instruction must stop and ask.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  const positions = engine
    .getCurrentContext()
    .windows.map((w) => `${w.id}:${w.position.x.toFixed(2)}`)
    .join(' ');
  const ambiguous = await routeUtterance('bring the one on the right forward');
  assert(
    ambiguous.clarification !== null,
    `two windows sit at the right (${positions}) — NOVA should ask, got ${JSON.stringify(ambiguous.clarification)}`,
  );
  assert(ambiguous.commands.length === 0, 'nothing moves while the question is open');
  pass('An ambiguous instruction stops and asks instead of moving something');

  const nonsense = await routeUtterance('deploy the mars colony');
  assert(nonsense.understood === false, 'an unrecognisable instruction is reported as unresolved');
  assert(nonsense.commands.length === 0, 'and executes nothing');
  pass('An unrecognisable instruction changes nothing');

  stop();
}

// --- geometry sanity ---------------------------------------------------------

console.log('--- Adjacency thresholds ---');
{
  const a = { id: 'a', position: { x: 0, y: 0, z: 0 }, width: 2, height: 1.5, scale: 1 };
  assert(isBeside({ ...a, id: 'b', position: { x: 3, y: 0, z: 0 } }, a), 'a 1-unit gap reads as beside');
  assert(!isBeside({ ...a, id: 'b', position: { x: 6, y: 0, z: 0 } }, a), 'a 4-unit gap does not');
  assert(!isBeside({ ...a, id: 'b', position: { x: 3, y: 2.5, z: 0 } }, a), 'a large vertical offset breaks beside');
  assert(!isBeside({ ...a, id: 'b', position: { x: 3, y: 0, z: 2.5 } }, a), 'a large depth offset breaks beside');
  pass('Adjacency thresholds behave at their boundaries');
}

console.log('\n========================================');
if (failures) {
  // Throwing rather than exiting keeps this suite free of Node type
  // dependencies, and still fails the run — the same shape as verifyVision.
  throw new Error(`${failures} of ${checks} context assertions FAILED`);
}
console.log(`ALL ${checks} CONTEXT ASSERTIONS PASSED! 🎉`);
console.log('========================================');
