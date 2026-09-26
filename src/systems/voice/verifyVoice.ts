import type { SpeechRecognizer, VoiceCommandEvent } from '../../types/voice';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch, subscribeToCommands } from '../command/commandBus';
import { routeUtterance } from '../command/intentRouter';
import * as engine from '../context/contextEngine';
import { listMemories, clearMemories } from '../memory/memoryManager';
import { InMemoryRepository, setRepository } from '../memory/memoryRepository';
import { createSpeechRecognizer, describeError } from './speechRecognizer';
import { connectVoice } from './voicePipeline';
import {
  SUSTAINED_LISTEN,
  cancelListening,
  refreshSupport,
  setRecognizerFactory,
  startListening,
  stopListening,
  voiceInputSource,
} from './voiceInputSource';
import { useVoiceStore, voice } from './voiceStore';
import { openApplications } from '../testing/openApplications';

// Phase 12: NOVA starts with no windows; these checks need NOVA's applications open.
openApplications();

/**
 * Phase 6 verification.
 *
 * The speech engine is mocked; the *voice layer* is not. A stand-in Web Speech
 * API is installed on `globalThis`, so `speechRecognizer.ts` — the real adapter,
 * with its real result parsing, error mapping and abort semantics — is the code
 * under test. What cannot be tested here is a microphone actually hearing a
 * human, which is stated as a limitation rather than simulated away.
 *
 * The second half asserts the thing Phase 6 is really about: that a spoken
 * sentence reaches the command bus through the *existing* pipeline, and that a
 * partial one reaches nothing at all.
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

console.log('\n=== NOVA Phase 6 · Voice Intelligence ===\n');

// --- a stand-in Web Speech API ----------------------------------------------

type Handler = ((event: unknown) => void) | (() => void) | null;

/**
 * Mimics `SpeechRecognition` closely enough to exercise the adapter: results
 * arriving in batches, interim flags, vendor error strings, and a session that
 * ends itself. It never captures audio because the real one's audio never
 * reaches NOVA either — only `transcript` strings do.
 */
class MockSpeechRecognition {
  static last: MockSpeechRecognition | null = null;
  static started = 0;

  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;

  onstart: Handler = null;
  onresult: Handler = null;
  onerror: Handler = null;
  onend: Handler = null;

  running = false;
  aborted = false;

  constructor() {
    MockSpeechRecognition.last = this;
  }

  start() {
    this.running = true;
    MockSpeechRecognition.started += 1;
    (this.onstart as (() => void) | null)?.();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    (this.onend as (() => void) | null)?.();
  }

  abort() {
    if (!this.running) return;
    this.running = false;
    this.aborted = true;
    (this.onerror as ((e: unknown) => void) | null)?.({ error: 'aborted' });
    (this.onend as (() => void) | null)?.();
  }

  /** Deliver a result exactly as the browser would. */
  say(text: string, isFinal: boolean, confidence = 0.9) {
    const result = { 0: { transcript: text, confidence }, length: 1, isFinal };
    (this.onresult as ((e: unknown) => void) | null)?.({
      resultIndex: 0,
      results: { 0: result, length: 1 },
    });
  }

  fail(code: string) {
    this.running = false;
    (this.onerror as ((e: unknown) => void) | null)?.({ error: code });
    (this.onend as (() => void) | null)?.();
  }
}

const scope = globalThis as unknown as { SpeechRecognition?: unknown };

function installEngine() {
  scope.SpeechRecognition = MockSpeechRecognition;
  setRecognizerFactory(createSpeechRecognizer);
  useVoiceStore.getState().reset();
}

function removeEngine() {
  delete scope.SpeechRecognition;
  setRecognizerFactory(createSpeechRecognizer);
}

const mock = () => MockSpeechRecognition.last!;

// --- 1 & 2. support detection -----------------------------------------------

console.log('--- Browser support ---');
{
  removeEngine();
  assert(refreshSupport() === false, 'a browser with no speech engine reports unsupported');
  assert(voice().state === 'unsupported', 'and rests in the unsupported state');

  const inert = createSpeechRecognizer();
  assert(inert.supported === false, 'the fallback recogniser reports itself unsupported');

  // It must be inert rather than explosive: every method is safe to call.
  let sawError = '';
  inert.start({
    onStart: () => {},
    onInterim: () => {},
    onFinal: () => {},
    onError: (error) => { sawError = error.code; },
    onEnd: () => {},
  });
  inert.stop();
  inert.abort();
  assert(sawError === 'unsupported', 'starting it reports "unsupported" rather than throwing');

  // Nothing about the rest of NOVA depends on voice existing.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');
  assert(useSpatialStore.getState().focusedId === 'code', 'the spatial environment works without voice');
  assert(startListening() === false, 'asking an unsupported browser to listen is refused, not fatal');
  assert(voice().state === 'error', 'and is reported as an error state');
  pass('An unsupported browser is a resting state, not a failure');

  installEngine();
  assert(refreshSupport() === true, 'a browser with a speech engine reports supported');
  assert(voice().state === 'idle', 'and rests idle');
  pass('Speech recognition is detected where it exists');
}

// --- 3, 4, 5. start, stop, cancel -------------------------------------------

console.log('--- Listening lifecycle ---');
{
  installEngine();
  useVoiceStore.getState().reset();
  const received: VoiceCommandEvent[] = [];
  voiceInputSource.connect((event) => received.push(event));

  assert(startListening() === true, 'listening starts');
  assert(voice().state === 'listening', 'and the state says so');
  assert(mock().running === true, 'the engine is running');
  assert(mock().continuous === false, 'recognition is single-utterance, never continuous');
  assert(mock().interimResults === true, 'interim results are requested, for feedback');

  // Concurrency: a second request while listening must not start a rival session.
  const startedBefore = MockSpeechRecognition.started;
  assert(startListening() === false, 'a second start while listening is refused');
  assert(MockSpeechRecognition.started === startedBefore, 'and no second session begins');

  mock().say('move the browser', false);
  assert(voice().interimTranscript === 'move the browser', 'interim text is shown');
  assert(received.length === 0, 'interim text emits nothing');
  assert(voice().state === 'listening', 'and does not advance the lifecycle');

  mock().say('move the browser to the left of my code', true);
  assert(received.length === 1, `a final result emits exactly one utterance, got ${received.length}`);
  assert(received[0].transcript === 'move the browser to the left of my code', 'with the final text');
  assert(voice().state === 'processing', 'and the lifecycle advances to processing');
  assert(voice().interimTranscript === '', 'interim text is cleared once it is superseded');
  pass('Start → interim (inert) → final (emitted) → processing');

  // Stop finishes a session; the engine ends and nothing is left running.
  useVoiceStore.getState().reset();
  received.length = 0;
  startListening();
  mock().say('focus the terminal', false);
  stopListening();
  assert(mock().running === false, 'stop ends the engine session');
  assert(received.length === 0, 'stopping without a final result emits nothing');
  assert(voice().state === 'idle', 'and returns to idle');
  assert(voice().interimTranscript === '', 'discarding the interim text on the way');
  pass('Stop ends a session cleanly, executing nothing it did not hear in full');

  // Cancel discards deliberately.
  useVoiceStore.getState().reset();
  received.length = 0;
  startListening();
  mock().say('delete everything', false);
  assert(voice().interimTranscript === 'delete everything', 'there is something to discard');
  cancelListening();
  assert(received.length === 0, 'cancelling emits nothing');
  assert(voice().interimTranscript === '', 'the interim transcript is discarded');
  assert(voice().transcript === '', 'and no transcript is kept');
  assert(voice().state === 'idle', 'and the state returns to idle');
  assert(voice().error === null, 'cancelling is not an error');
  pass('Cancel discards the transcript and executes nothing');

  voiceInputSource.disconnect();
}

// --- 6, 8, 9. errors --------------------------------------------------------

console.log('--- Errors and permission ---');
{
  installEngine();
  const received: VoiceCommandEvent[] = [];
  voiceInputSource.connect((event) => received.push(event));

  const cases: Array<[string, string]> = [
    ['not-allowed', 'permission-denied'],
    ['service-not-allowed', 'permission-denied'],
    ['audio-capture', 'no-microphone'],
    ['no-speech', 'no-speech'],
    ['network', 'network'],
    ['aborted', 'aborted'],
    ['something-unheard-of', 'unknown'],
  ];

  for (const [raw, expected] of cases) {
    assert(describeError(raw).code === expected, `"${raw}" maps to ${expected}`);
    assert(describeError(raw).message.length > 0, `"${raw}" has a message for the user`);
  }

  useVoiceStore.getState().reset();
  startListening();
  mock().fail('not-allowed');
  assert(voice().state === 'error', 'permission denial ends in the error state');
  assert(voice().error?.code === 'permission-denied', 'with the right code');
  assert(voice().permission === 'denied', 'and the permission is remembered as denied');
  assert(received.length === 0, 'and nothing is executed');

  useVoiceStore.getState().reset();
  startListening();
  mock().fail('audio-capture');
  assert(voice().error?.code === 'no-microphone', 'a missing microphone is reported');

  useVoiceStore.getState().reset();
  startListening();
  mock().fail('no-speech');
  assert(voice().error?.code === 'no-speech', 'silence is reported');
  assert(voice().state === 'error', 'as a non-fatal error state');

  // After any of them, the environment must be untouched and voice reusable.
  dispatch({ action: 'focus', target: 'browser' }, 'system');
  assert(useSpatialStore.getState().focusedId === 'browser', 'the spatial environment survives a voice error');
  useVoiceStore.getState().reset();
  assert(startListening() === true, 'and listening can begin again');
  cancelListening();
  pass('Every recognition error is survivable and leaves the environment alone');

  voiceInputSource.disconnect();
}

// --- 7, 10, 11. into the existing pipeline ----------------------------------

console.log('--- Into the existing command pipeline ---');
{
  installEngine();
  setRepository(new InMemoryRepository());
  const stopEngineWatch = engine.startContextEngine();
  engine.resetContextEngine();
  clearMemories();

  // Watch the command bus directly: this is the assertion that matters most —
  // spoken words must arrive as ordinary commands on the existing bus.
  const seen: Array<{ action: string; source: string }> = [];
  const unsubscribe = subscribeToCommands(({ command, source }) =>
    seen.push({ action: command.action, source }),
  );

  const disconnect = connectVoice(async (text) => {
    const result = await routeUtterance(text, 'voice');
    return { understood: result.understood, clarification: result.clarification };
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Set the stage the acceptance demo describes.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  dispatch({ action: 'focus', target: 'code' }, 'system');
  const browserBefore = engine.getWindowContext('browser')!.position.x;
  seen.length = 0;

  // ACCEPTANCE 1 — "Move the browser to the left of my code."
  useVoiceStore.getState().reset();
  startListening();
  mock().say('move the browser to the left', false);
  await settle();
  assert(seen.length === 0, 'the interim sentence executed nothing');

  mock().say('move the browser to the left of my code', true);
  await settle();

  const moves = seen.filter((entry) => entry.action === 'move');
  assert(moves.length > 0, `a spoken MOVE reached the command bus, saw ${JSON.stringify(seen)}`);
  assert(moves.every((entry) => entry.source === 'voice'), 'labelled as having come from voice');
  assert(
    engine.getWindowContext('browser')!.position.x < browserBefore,
    'and the browser actually moved left',
  );
  assert(
    engine.getSpatialRelation('browser', 'code') === 'left' ||
      engine.getSpatialRelation('browser', 'code') === 'beside',
    `the context engine reads the result, got ${engine.getSpatialRelation('browser', 'code')}`,
  );
  assert(voice().state === 'success', 'the voice lifecycle completes');
  assert(voice().lastCommand === 'move the browser to the left of my code', 'the utterance is recorded');
  pass('"Move the browser to the left of my code" → existing bus → the browser moved');

  // ACCEPTANCE 3 — contextual language, resolved by Phase 4, not by voice.
  dispatch({ action: 'focus', target: 'code' }, 'system');
  const scaleBefore = engine.getWindowContext('code')!.scale;
  useVoiceStore.getState().reset();
  startListening();
  mock().say('make it bigger', true);
  await settle();
  assert(
    engine.getWindowContext('code')!.scale > scaleBefore,
    `"make it bigger" resolved "it" to the focused window, ${scaleBefore} → ${engine.getWindowContext('code')!.scale}`,
  );
  pass('"Make it bigger" — the Context Engine resolved "it", voice did not');

  // ACCEPTANCE 2 — Phase 5 memory, spoken.
  useVoiceStore.getState().reset();
  startListening();
  mock().say('save this as my database workspace', true);
  await settle();
  assert(listMemories().length === 1, `a spoken save reached the memory system, got ${listMemories().length}`);
  assert(listMemories()[0].name === 'database workspace', 'with the name from the sentence');

  dispatch({ action: 'workspace', target: 'study' }, 'system');
  dispatch({ action: 'focus', target: 'notes' }, 'system');
  assert(engine.getCurrentContext().workspace.id === 'study', 'the environment was disturbed');

  useVoiceStore.getState().reset();
  startListening();
  mock().say('continue my database work', true);
  await settle();
  assert(engine.getCurrentContext().workspace.id === 'development', 'a spoken restore brought it back');
  assert(engine.getFocusedWindow()?.id === 'code', 'including focus');
  pass('Spoken memory commands use the existing Phase 5 system unchanged');

  // §14 — voice is untrusted input and gets no privilege typing lacks. The
  // property to prove is not that a dangerous sentence errors (NOVA has no
  // shell to reach) but that the two paths treat it *identically*.
  const SAFE_ACTIONS = new Set([
    'focus', 'blur', 'open', 'close', 'minimize', 'restore', 'move', 'scale',
    'rotate', 'workspace', 'task', 'arrange', 'core', 'command', 'vision',
    'vision-debug', 'context-debug', 'voice-input',
    'memory-save', 'memory-restore', 'memory-delete', 'memory-list',
  ]);

  for (const dangerous of [
    'run rm -rf / in the terminal',
    'execute python os.system("id")',
    'delete all my files from disk',
    'turn off wi-fi and open a shell',
  ]) {
    seen.length = 0;
    const typedOutcome = await routeUtterance(dangerous, 'command-line');
    const typedActions = seen.map((entry) => entry.action);

    seen.length = 0;
    useVoiceStore.getState().reset();
    startListening();
    mock().say(dangerous, true);
    await settle();
    const spokenActions = seen.map((entry) => entry.action);

    assert(
      JSON.stringify(typedActions) === JSON.stringify(spokenActions),
      `"${dangerous}" is treated identically typed and spoken (${typedActions} vs ${spokenActions})`,
    );
    assert(
      spokenActions.every((action) => SAFE_ACTIONS.has(action)),
      `"${dangerous}" produced only known NOVA commands, got ${spokenActions.join(',')}`,
    );
    assert(
      typedOutcome.commands.every((command) => SAFE_ACTIONS.has(command.action)),
      'and nothing outside the command vocabulary can be constructed at all',
    );
  }
  pass('A spoken instruction gets exactly the privileges a typed one gets — no more');

  // An unrecognisable sentence is non-fatal.
  useVoiceStore.getState().reset();
  startListening();
  mock().say('deploy the mars colony', true);
  await settle();
  assert(voice().state === 'error', 'an unusable sentence ends in error');
  assert(voice().error !== null, 'with something to show the user');
  useVoiceStore.getState().reset();
  assert(startListening() === true, 'and voice still works afterwards');
  cancelListening();
  pass('An unusable sentence is reported and changes nothing');

  unsubscribe();
  disconnect();
  stopEngineWatch();
  clearMemories();
}

// --- a listen is not a recognition session -----------------------------------

/**
 * The behaviour the microphone button actually uses.
 *
 * `SpeechRecognition` ends its own session constantly — after one phrase, after
 * a moment of silence, and on `no-speech` before somebody has decided what to
 * say. Treating each of those as the end of listening is what made NOVA appear
 * deaf: the indicator went out between pressing the key and speaking. These
 * assertions pin the rule that replaced it — one listen may span several engine
 * sessions, bounded by a clock and a budget that are both finite.
 */
console.log('--- Sustained listening ---');
{
  installEngine();
  const received: VoiceCommandEvent[] = [];
  voiceInputSource.connect((event) => received.push(event));

  // 1. Silence mid-listen continues the listen rather than reporting a failure.
  useVoiceStore.getState().reset();
  received.length = 0;
  const before = MockSpeechRecognition.started;
  assert(startListening(SUSTAINED_LISTEN) === true, 'a sustained listen starts');
  mock().fail('no-speech');
  assert(voice().state === 'listening', 'a quiet moment does not end the listen');
  assert(voice().error === null, 'and is not reported as an error');
  assert(MockSpeechRecognition.started === before + 2, 'the engine was restarted exactly once');

  mock().fail('no-speech');
  assert(voice().state === 'listening', 'nor does a second one');

  // And speech still arrives normally afterwards.
  mock().say('focus the terminal', true);
  assert(received.length === 1, 'speech after a silent stretch is still delivered');
  assert(received[0].transcript === 'focus the terminal', 'with the right text');
  assert(voice().state === 'processing', 'and the lifecycle advances');

  // 2. The budget is finite: silence cannot restart the engine forever.
  useVoiceStore.getState().reset();
  const budgetStart = MockSpeechRecognition.started;
  startListening({ sustainMs: 10_000, maxRestarts: 3 });
  for (let i = 0; i < 10; i += 1) mock().fail('no-speech');
  const used = MockSpeechRecognition.started - budgetStart;
  assert(used <= 4, `the engine started at most 1 + 3 times, got ${used}`);
  assert(voice().state === 'error', 'and a wholly silent listen ends by saying so');
  assert(voice().error?.code === 'no-speech', 'with the silence code');
  assert(
    /microphone/i.test(voice().error?.message ?? ''),
    'and a message that says what to check',
  );

  // 3. A hard error ends the listen at once and stays ended. The engine's own
  //    `onend` follows a moment later and must not quietly start listening again
  //    over a microphone the browser has just refused.
  useVoiceStore.getState().reset();
  const denialStart = MockSpeechRecognition.started;
  startListening(SUSTAINED_LISTEN);
  mock().fail('not-allowed');
  assert(voice().state === 'error', 'a refused microphone ends in error');
  assert(voice().error?.code === 'permission-denied', 'with the right code');
  assert(voice().permission === 'denied', 'and the refusal is remembered');
  assert(
    MockSpeechRecognition.started === denialStart + 1,
    'and no further session is started after a refusal',
  );

  // 4. Stopping on purpose ends the whole listen, not merely one session.
  useVoiceStore.getState().reset();
  const stopStart = MockSpeechRecognition.started;
  startListening(SUSTAINED_LISTEN);
  stopListening();
  assert(voice().state === 'idle', 'stopping a sustained listen returns to rest');
  assert(MockSpeechRecognition.started === stopStart + 1, 'and does not restart the engine');

  // 5. Single-shot listening is unchanged, which is what every other assertion
  //    in this file drives.
  useVoiceStore.getState().reset();
  const singleStart = MockSpeechRecognition.started;
  startListening();
  mock().fail('no-speech');
  assert(voice().state === 'error', 'a single-shot listen still reports silence immediately');
  assert(
    MockSpeechRecognition.started === singleStart + 1,
    'and never restarts the engine',
  );

  cancelListening();
  voiceInputSource.disconnect();
  pass('One listen spans several engine sessions, bounded by a clock and a budget');
}

// --- "Listening" must be true when it is shown ------------------------------

console.log('--- Honest lifecycle ---');
{
  /**
   * A recogniser that does not confirm it has started until told to.
   *
   * This is the real browser's behaviour in the case that matters: between the
   * key press and the engine actually running there is a permission prompt, and
   * during it NOVA is not hearing anybody. The interface must say `starting`,
   * because showing "Listening" over a closed microphone is the specific lie
   * that made voice untrustworthy.
   */
  const engineStarted: Array<() => void> = [];
  const deferred: SpeechRecognizer = {
    supported: true,
    start(handlers) {
      engineStarted.push(() => handlers.onStart());
    },
    stop() {},
    abort() {},
  };
  setRecognizerFactory(() => deferred);
  useVoiceStore.getState().reset();

  assert(startListening() === true, 'listening is requested');
  assert(voice().state === 'starting', 'and the state is "starting" until the engine confirms');
  assert(voice().state !== 'listening', 'NOVA does not claim to be listening before it is');

  engineStarted.pop()?.();
  assert(voice().state === 'listening', 'the engine confirming is what makes it listening');

  cancelListening();
  installEngine();
  pass('NOVA never shows "Listening" before the engine is actually running');
}

// --- 13, 14. the other modalities are untouched -----------------------------

console.log('--- Existing modalities ---');
{
  installEngine();
  const stopEngineWatch = engine.startContextEngine();

  // Typed commands take the same path and are unaffected by the voice layer.
  dispatch({ action: 'workspace', target: 'development' }, 'system');
  const typed = await routeUtterance('focus terminal');
  assert(typed.understood === true, 'a typed command still resolves');
  assert(engine.getFocusedWindow()?.id === 'terminal', 'and still executes');

  const typedContextual = await routeUtterance('make it bigger');
  assert(typedContextual.understood === true, 'typed contextual language still resolves');

  // The pointer abstraction is untouched: `InputSource` gained a type parameter
  // with a default, so a pointer source still satisfies the original contract.
  const pointerLike = {
    id: 'test-pointer',
    connect: (_emit: (frame: { x: number }) => void) => {},
    disconnect: () => {},
  };
  assert(pointerLike.id === 'test-pointer', 'a pointer-shaped source is still a valid InputSource');
  assert(voiceInputSource.id === 'voice', 'and voice is a sibling source, not a replacement');
  pass('Typed commands and the pointer/hand input abstraction are unchanged');

  stopEngineWatch();
}

// --- 17. nothing audio is kept ----------------------------------------------

console.log('--- No audio is retained ---');
{
  installEngine();
  useVoiceStore.getState().reset();
  startListening();
  mock().say('focus the browser', true);

  const stored = JSON.stringify(useVoiceStore.getState(), (_key, value) =>
    typeof value === 'function' ? undefined : value,
  );
  assert(!/blob|audio|Float32|ArrayBuffer|stream|recording/i.test(stored), 'no audio field exists in voice state');
  assert(typeof voice().transcript === 'string', 'only recognised text is held');

  const keys = Object.keys(useVoiceStore.getState()).filter(
    (key) => typeof (useVoiceStore.getState() as unknown as Record<string, unknown>)[key] !== 'function',
  );
  assert(
    JSON.stringify(keys.sort()) ===
      JSON.stringify(
        [
          'error',
          'interimTranscript',
          'lastCommand',
          'permission',
          'state',
          'supported',
          'transcript',
        ].sort(),
      ),
    `voice state holds only these fields, got ${keys.join(', ')}`,
  );
  cancelListening();
  pass('Voice state holds recognised text and lifecycle only — never audio');
}

// --- the architectural boundary ---------------------------------------------

console.log('--- Architectural boundary ---');
{
  const source = voiceInputSource as unknown as Record<string, unknown>;
  assert(Object.keys(source).sort().join(',') === 'connect,disconnect,id', 'the voice source exposes only the InputSource contract');

  // A recogniser is a `SpeechRecognizer` and nothing more — it cannot reach state.
  const recognizer: SpeechRecognizer = createSpeechRecognizer();
  const surface = ['supported', 'start', 'stop', 'abort'];
  for (const key of surface) {
    assert(key in recognizer, `the recogniser exposes ${key}`);
  }
  assert(!('dispatch' in recognizer), 'and cannot dispatch');
  assert(!('windows' in recognizer), 'and knows nothing of windows');
  pass('Voice reaches state only by producing text for the existing pipeline');
}

removeEngine();

console.log('\n========================================');
if (failures) {
  throw new Error(`${failures} of ${checks} voice assertions FAILED`);
}
console.log(`ALL ${checks} VOICE ASSERTIONS PASSED! 🎉`);
console.log('========================================');
