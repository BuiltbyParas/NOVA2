import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useSpatialStore } from '../../state/spatialStore';
import { useVoiceStore } from '../../systems/voice/voiceStore';
import { useNativeStore } from '../../systems/native/nativeStore';
import { probeIntelligence } from '../../systems/command/intentRouter';
import { dispatch } from '../../systems/command/commandBus';
import { useHandPresence } from '../../vision/useHandPresence';

/**
 * What NOVA currently is.
 *
 * One small panel, four rows, and a list of the applications the host actually
 * has. It exists because NOVA's whole claim — that several input modalities
 * converge on one command layer attached to a real computer — is invisible
 * while each modality reports itself in a different corner of the screen.
 *
 * Every value here is read from the system that owns it. Nothing is a label
 * chosen to look impressive: `Native` says `Unaware` when no provider answered,
 * and `Hand` says `Off` when the camera is off, because a status panel that
 * flatters the system it describes is worse than no status panel.
 */

type Tone = 'ok' | 'live' | 'warn' | 'off';

function Row({
  label,
  value,
  tone,
  onClick,
  title,
}: {
  label: string;
  value: string;
  tone: Tone;
  onClick?: () => void;
  title?: string;
}) {
  const content = (
    <>
      <span className="hud__label">{label}</span>
      <span className="hud__value" data-tone={tone}>
        <span className="hud__dot" />
        {value}
      </span>
    </>
  );

  return onClick ? (
    <button type="button" className="hud__row hud__row--action" onClick={onClick} title={title}>
      {content}
    </button>
  ) : (
    <div className="hud__row" title={title}>
      {content}
    </div>
  );
}

/**
 * The camera, as a control.
 *
 * Hand tracking is one of NOVA's three input modalities and the only one whose
 * control the presentation sprint mislaid: the old interface carried a labelled
 * "Vision off / Vision active" chip, and folding it into a status list left a
 * row that looked exactly like the three unclickable ones beside it. The
 * pipeline behind it never moved — this is the switch, put back where the rest
 * of the system state now lives.
 *
 * The distinction the label keeps is between the camera running and a hand
 * being seen. They are not the same fact and NOVA should not report them with
 * the same word.
 */
function HandRow() {
  const visionStatus = useSpatialStore((state) => state.visionStatus);
  const visionError = useSpatialStore((state) => state.visionError);
  const visionDebug = useSpatialStore((state) => state.visionDebug);

  const running = visionStatus === 'active';
  const handPresent = useHandPresence(running);

  const [value, tone]: [string, Tone] = !running
    ? visionStatus === 'starting'
      ? ['Starting', 'warn']
      : visionStatus === 'error'
        ? ['Error', 'warn']
        : ['Off', 'off']
    : handPresent
      ? ['Tracking', 'live']
      : ['Ready', 'ok'];

  const title =
    visionStatus === 'error'
      ? (visionError ?? 'The camera could not be started')
      : running
        ? 'Turn the camera off (V)'
        : 'Turn on hand tracking (V)';

  return (
    <div className="hud__hand">
      <Row
        label="Hand"
        value={value}
        tone={tone}
        onClick={() => dispatch({ action: 'vision' }, 'pointer')}
        title={title}
      />
      {/* Offered only while the camera is on: a preview is meaningless without
          one, and a permanent link to it would be clutter. */}
      {running && (
        <button
          type="button"
          className="hud__aside"
          aria-pressed={visionDebug}
          onClick={() => dispatch({ action: 'vision-debug' }, 'pointer')}
          title="Show what the camera sees (D)"
        >
          {visionDebug ? 'Hide camera view' : 'Camera view'}
        </button>
      )}
    </div>
  );
}

/**
 * The installed applications NOVA can see, running ones first.
 *
 * Capped deliberately. This is evidence that NOVA understands the computer, not
 * an application manager — a hundred-row list would be both slower and less
 * convincing than six rows somebody can read at a glance.
 */
const APPLICATION_ROWS = 6;

function NativeApplications() {
  const snapshot = useNativeStore((store) => store.snapshot);

  if (snapshot.status !== 'ok' || !snapshot.capabilities.applicationEnumeration) return null;

  const shown = [...snapshot.applications]
    .sort((a, b) => Number(b.running) - Number(a.running) || a.name.localeCompare(b.name))
    .slice(0, APPLICATION_ROWS);

  if (!shown.length) return null;

  const running = snapshot.applications.filter((application) => application.running).length;

  return (
    <div className="hud__section">
      <div className="hud__heading">
        <span>Native applications</span>
        <span className="hud__count">
          {running}/{snapshot.applications.length}
        </span>
      </div>
      {shown.map((application) => (
        <div className="hud__app" key={application.nativeId} data-running={application.running}>
          <span className="hud__app-dot" />
          <span className="hud__app-name">{application.name}</span>
          <span className="hud__app-state">
            {application.running ? 'Running' : 'Available'}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A continuous sign of native awareness.
 *
 * The application list above already carries the running count, but it is a
 * still reading: nothing on screen says that NOVA keeps looking. This is that
 * one line, animated in CSS only, off the same snapshot every other native
 * reading uses — no second poll, no second source of truth.
 */
function NovaPulse() {
  const snapshot = useNativeStore((store) => store.snapshot);

  const running =
    snapshot.status === 'ok'
      ? snapshot.applications.filter((application) => application.running).length
      : 0;

  return (
    <div className="hud__pulse" data-live={snapshot.status === 'ok'}>
      <span className="hud__pulse-dot" />
      <span className="hud__pulse-label">NOVA Pulse</span>
      <span className="hud__pulse-count">{running} apps active</span>
    </div>
  );
}

export function StatusHUD() {
  const coreState = useSpatialStore((state) => state.core.state);
  const quality = useSpatialStore((state) => state.quality);
  const voiceState = useVoiceStore((store) => store.state);
  const snapshot = useNativeStore((store) => store.snapshot);

  const [intelligence, setIntelligence] = useState<'checking' | 'ready' | 'local'>('checking');

  useEffect(() => {
    // Asked once, exactly as the router asks it. A status panel must not become
    // a reason to make network requests NOVA would not otherwise make.
    void probeIntelligence().then((available) => setIntelligence(available ? 'ready' : 'local'));
  }, []);

  const voice: [string, Tone] =
    voiceState === 'unsupported'
      ? ['Unavailable', 'off']
      : voiceState === 'listening'
        ? ['Listening', 'live']
        : voiceState === 'starting'
          ? ['Starting', 'warn']
          : voiceState === 'processing'
            ? ['Processing', 'live']
            : voiceState === 'error'
              ? ['Error', 'warn']
              : ['Ready', 'ok'];

  const native: [string, Tone] =
    snapshot.status === 'ok'
      ? [
          // The distribution's own name plus the desktop, with "Linux" dropped:
          // the panel has one line for this and "Fedora · GNOME" says the same
          // thing as "Fedora Linux · GNOME" in two thirds of the width.
          [(snapshot.osName ?? 'Host').replace(/\s*Linux$/, ''), snapshot.desktopEnvironment]
            .filter(Boolean)
            .join(' · '),
          'ok',
        ]
      : snapshot.status === 'error'
        ? ['Error', 'warn']
        : ['Unaware', 'off'];

  const ai: [string, Tone] =
    intelligence === 'ready'
      ? ['Ready', 'ok']
      : intelligence === 'local'
        ? ['Local only', 'ok']
        : ['Checking', 'warn'];

  return (
    <motion.aside
      className="hud"
      initial={{ opacity: 0, x: 10, filter: 'blur(5px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 0.9, 0.24, 1] }}
    >
      <header className="hud__head">
        <button
          type="button"
          className="hud__mark"
          onClick={() => dispatch({ action: 'command', open: true }, 'pointer')}
          title="Open the command line (⌘K)"
        >
          NOVA
        </button>
        <span className="hud__online" data-state={coreState}>
          <span className="hud__dot" />
          {/* The Core enters `listening` whenever the command line opens, which
              is not the same thing as the microphone being open — showing it
              here read as "NOVA is listening" beside a Voice row saying
              "Ready". Only real work is worth a different word. */}
          {coreState === 'working' ? 'Working' : 'Online'}
          {quality === 'low' && ' · reduced'}
        </span>
      </header>

      <div className="hud__section">
        <Row label="Voice" value={voice[0]} tone={voice[1]} />
        <HandRow />
        <Row
          label="Native"
          value={native[0]}
          tone={native[1]}
          title={snapshot.notes[0]}
        />
        <Row label="AI" value={ai[0]} tone={ai[1]} />
      </div>

      <NativeApplications />

      <NovaPulse />
    </motion.aside>
  );
}
