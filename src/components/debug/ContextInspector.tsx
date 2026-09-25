import { useEffect, useState } from 'react';
import { useSpatialStore } from '../../state/spatialStore';
import { dispatch, subscribeToCommands } from '../../systems/command/commandBus';
import { buildGeminiContext, getCurrentContext } from '../../systems/context/contextEngine';
import { useMemoryStore } from '../../systems/memory/memoryStore';
import { isPersistent } from '../../systems/memory/memoryRepository';
import { useTraceStore } from '../../systems/multimodal/pipelineTrace';
import { onReferentChange } from '../../systems/multimodal/interactionContext';
import { useNativeStore } from '../../systems/native/nativeStore';
import { currentSync } from '../../systems/native/nativeSpatialSync';
import { refreshNativeSnapshot } from '../../systems/native/useNativeAwareness';
import type { NovaContextGraph } from '../../types/context';

/**
 * Developer context inspector.
 *
 * NOVA's context layer is invisible by design — it changes what the system
 * understands, not what it looks like. This panel exists so that understanding
 * can be checked while building, and for nothing else. It reads context; it
 * never writes any.
 *
 * It is wrapped in `import.meta.env.DEV` at its mount site, so it and its cost
 * leave the production bundle entirely. Press `c` to show it.
 *
 * Phase 5 added the memory list at the bottom. It is an instrument, not a
 * feature: a place to see what is stored and to restore or forget it while
 * building. NOVA's actual interface for memory is the command line.
 *
 * Phase 7 added the pipeline trace: which device supplied the referent, what
 * was said, how it resolved, which commands reached the bus, and what happened.
 * Reading it is the fastest way to tell a recognition problem from a resolution
 * problem from an execution problem.
 *
 * Phase 8 added the native section: what NOVA can see of the host, and — just
 * as importantly — what it cannot, and why. A capability reported false with no
 * explanation reads like a bug; with one, it reads like a boundary.
 */
export function ContextInspector() {
  const open = useSpatialStore((state) => state.contextDebug);
  const toggle = useSpatialStore((state) => state.toggleContextDebug);
  const [graph, setGraph] = useState<NovaContextGraph | null>(null);
  const [showPayload, setShowPayload] = useState(false);

  // Event-driven, like the engine itself: the panel re-reads when a command
  // lands, never on a timer and never per frame.
  useEffect(() => {
    if (!open) return;
    setGraph(getCurrentContext());
    const stopCommands = subscribeToCommands(() => setGraph(getCurrentContext()));
    // Pointing at a window issues no command, but it does change what "this"
    // means — so the panel listens for that too. It fires on target changes
    // only, never per frame.
    const stopReferent = onReferentChange(() => setGraph(getCurrentContext()));
    return () => {
      stopCommands();
      stopReferent();
    };
  }, [open]);

  if (!open || !graph) return null;

  const focused = graph.focusedId ? graph.byId[graph.focusedId] : null;

  return (
    <div className="context-inspector">
      <div className="context-inspector__header">
        <span className="context-inspector__title">CONTEXT</span>
        <button
          type="button"
          className="context-inspector__close"
          onClick={() => toggle(false)}
          aria-label="Close context inspector"
        >
          ×
        </button>
      </div>

      <div className="context-inspector__body">
        <div className="context-inspector__facts">
          <Row label="workspace" value={graph.workspace.name} />
          <Row label="task" value={graph.task?.name ?? '—'} />
          <Row label="focused" value={focused?.name ?? 'nothing'} />
          <Row
            label="recent"
            value={[...graph.recent].reverse().slice(0, 3).join(' · ') || '—'}
          />
          <Row label="referent" value={describeReferent(graph)} />
        </div>

        <ul className="context-inspector__windows">
          {graph.windows.map((win) => {
            const relations = win.relationships
              .filter((r) => r.relation === 'beside' || r.relation === 'left' || r.relation === 'right' || r.relation === 'above' || r.relation === 'below')
              .slice(0, 3)
              .map((r) => `${r.relation}:${r.target}`)
              .join(' ');
            return (
              <li key={win.id} className="context-inspector__window">
                <span className={win.focused ? 'context-inspector__name is-focused' : 'context-inspector__name'}>
                  {win.name}
                </span>
                <span className="context-inspector__role">{win.semanticRole}</span>
                <span className="context-inspector__relations">{relations || '—'}</span>
              </li>
            );
          })}
        </ul>

        <NativeSection />

        <NativeSyncSection />

        <PipelineSection />

        <MemorySection />

        <button
          type="button"
          className="context-inspector__payload-toggle"
          onClick={() => setShowPayload((value) => !value)}
        >
          {showPayload ? 'Hide' : 'Show'} model payload
        </button>

        {showPayload && (
          <pre className="context-inspector__payload">
            {JSON.stringify(buildGeminiContext(), null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * The host computer, read-only.
 *
 * Shows capabilities as a list of yes/no with the provider's own notes beneath,
 * because "window enumeration: no" is only half an answer. Refresh is manual
 * here; the running application otherwise re-reads on its own schedule.
 */
function NativeSection() {
  const snapshot = useNativeStore((state) => state.snapshot);
  const refreshing = useNativeStore((state) => state.refreshing);

  const running = snapshot.applications.filter((application) => application.running);
  const capabilities: Array<[string, boolean]> = [
    ['platform', snapshot.capabilities.platformDetection],
    ['applications', snapshot.capabilities.applicationEnumeration],
    ['running', snapshot.capabilities.runningProcessDetection],
    ['windows', snapshot.capabilities.windowEnumeration],
    ['geometry', snapshot.capabilities.windowGeometry],
    ['workspaces', snapshot.capabilities.workspaceEnumeration],
  ];

  return (
    <div className="context-inspector__memory">
      <div className="context-inspector__memory-head">
        <span>NATIVE</span>
        <button
          type="button"
          className="context-inspector__native-refresh"
          onClick={() => void refreshNativeSnapshot()}
          disabled={refreshing}
        >
          {refreshing ? 'reading…' : 'refresh'}
        </button>
      </div>

      <div className="context-inspector__facts">
        <Row label="status" value={snapshot.status} />
        <Row
          label="host"
          value={
            snapshot.status === 'ok'
              ? [snapshot.osName ?? snapshot.platform, snapshot.osVersion].filter(Boolean).join(' ')
              : '—'
          }
        />
        <Row
          label="session"
          value={
            snapshot.status === 'ok'
              ? [snapshot.desktopEnvironment, snapshot.sessionType].filter(Boolean).join(' / ')
              : '—'
          }
        />
      </div>

      <div className="context-inspector__native-caps">
        {capabilities.map(([label, allowed]) => (
          <span key={label} className="context-inspector__native-cap" data-allowed={allowed}>
            {label}
          </span>
        ))}
      </div>

      {running.length > 0 && (
        <ul className="context-inspector__windows">
          {running.slice(0, 6).map((application) => (
            <li key={application.nativeId} className="context-inspector__window">
              <span className="context-inspector__name">{application.name}</span>
              <span className="context-inspector__role">{application.appType}</span>
              <span className="context-inspector__relations">{application.nativeId}</span>
            </li>
          ))}
        </ul>
      )}

      {snapshot.notes.map((note) => (
        <p key={note} className="context-inspector__memory-empty">
          {note}
        </p>
      ))}
    </div>
  );
}

/**
 * How the two worlds line up.
 *
 * Reads the pure synchronisation function against live state. It is a *report*:
 * nothing here opens a window, launches anything, or changes either world.
 *
 * "native state unavailable" is shown as its own thing rather than as a row of
 * "not running" — the difference between knowing nothing runs and not being
 * able to look is the whole point of the layer.
 */
function NativeSyncSection() {
  // Re-derived whenever the panel re-renders, which is on commands and on the
  // native refresh — never on a timer of its own.
  const snapshot = useNativeStore((state) => state.snapshot);
  const sync = currentSync();

  return (
    <div className="context-inspector__memory">
      <div className="context-inspector__memory-head">
        <span>NATIVE SYNC</span>
        <span className="debug-k">{sync.available ? 'live' : 'unavailable'}</span>
      </div>

      {!sync.available ? (
        <p className="context-inspector__memory-empty">
          Native state unavailable — {reason(snapshot.notes[0])}. This is not the same
          as nothing running.
        </p>
      ) : (
        <>
          <ul className="context-inspector__windows">
            {sync.spatial.map((entry) => (
              <li key={entry.appType} className="context-inspector__window">
                <span className="context-inspector__name">
                  {entry.nativeName ?? entry.appType}
                </span>
                <span className="context-inspector__role" data-sync={entry.status}>
                  {entry.status}
                </span>
                <span className="context-inspector__relations">
                  {entry.spatialOpen ? 'spatial' : 'no surface'}
                  {' · '}
                  {entry.lifecycle}
                </span>
              </li>
            ))}
          </ul>

          {sync.nativeOnly.length > 0 && (
            <ul className="context-inspector__windows">
              {sync.nativeOnly.slice(0, 5).map((application) => (
                <li key={application.applicationId} className="context-inspector__window">
                  <span className="context-inspector__name">{application.name}</span>
                  <span className="context-inspector__role" data-sync="native-only">
                    native-only
                  </span>
                  <span className="context-inspector__relations">
                    {application.applicationId}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The provider's own words, made to sit inside a sentence.
 *
 * Notes arrive as complete sentences ending in a full stop, so they are
 * lower-cased at the seam and their trailing stop removed rather than quoted —
 * the reason belongs to the sentence, not beside it.
 */
function reason(note: string | undefined): string {
  if (!note) return 'no provider is reachable';
  const trimmed = note.trim().replace(/[.\s]+$/, '');
  return trimmed ? trimmed.charAt(0).toLowerCase() + trimmed.slice(1) : 'no provider is reachable';
}

/** What the input devices currently point at, in one line. */
function describeReferent(graph: NovaContextGraph): string {
  const referent = graph.referent;
  if (referent.status === 'resolved') {
    return `${referent.modality} ${referent.tier} → ${referent.windowId}`;
  }
  if (referent.status === 'ambiguous') {
    return `ambiguous · ${referent.candidates.map((c) => `${c.modality}→${c.windowId}`).join(' / ')}`;
  }
  return '—';
}

/**
 * The path instructions took.
 *
 * Reads a bounded buffer that the intent router fills. It decides nothing and
 * is rendered only in development.
 */
function PipelineSection() {
  const traces = useTraceStore((state) => state.traces);
  if (!traces.length) return null;

  return (
    <div className="context-inspector__memory">
      <div className="context-inspector__memory-head">
        <span>PIPELINE</span>
        <span className="debug-k">{traces.length}</span>
      </div>
      <ul className="context-inspector__trace">
        {traces.map((trace, index) => (
          <li key={`${trace.at}-${index}`} className="context-inspector__trace-item">
            <span className="context-inspector__trace-line">
              <span className="debug-k">input</span>
              <span>
                {trace.inputModality ? `${trace.inputModality} → ${trace.inputTarget}` : '—'}
              </span>
            </span>
            <span className="context-inspector__trace-line">
              <span className="debug-k">{trace.utteranceModality ?? 'said'}</span>
              <span className="context-inspector__trace-said">“{trace.utterance}”</span>
            </span>
            {trace.resolution && (
              <span className="context-inspector__trace-line">
                <span className="debug-k">resolved</span>
                <span>{trace.resolution}</span>
              </span>
            )}
            <span className="context-inspector__trace-line">
              <span className="debug-k">command</span>
              <span>{trace.commands.join(' · ') || '—'}</span>
            </span>
            <span className="context-inspector__trace-line">
              <span className="debug-k">result</span>
              <span data-result={trace.result}>{trace.result}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Saved arrangements.
 *
 * Reads the memory metadata store, which is refreshed only by explicit memory
 * operations — this panel never causes storage to be read, and never writes.
 */
function MemorySection() {
  const summaries = useMemoryStore((state) => state.summaries);
  const lastReport = useMemoryStore((state) => state.lastReport);

  return (
    <div className="context-inspector__memory">
      <div className="context-inspector__memory-head">
        <span>MEMORY</span>
        <span className="debug-k">{isPersistent() ? 'localStorage' : 'session only'}</span>
      </div>

      {summaries.length === 0 ? (
        <p className="context-inspector__memory-empty">
          Nothing saved. Try “save this as my database workspace”.
        </p>
      ) : (
        <ul className="context-inspector__memory-list">
          {summaries.map((summary) => (
            <li key={summary.id} className="context-inspector__memory-item">
              <span className="context-inspector__memory-name">{summary.name}</span>
              <span className="debug-k">
                {summary.workspaceName} · {summary.windowCount}
              </span>
              <span className="context-inspector__memory-actions">
                <button
                  type="button"
                  onClick={() => dispatch({ action: 'memory-restore', id: summary.id }, 'system')}
                >
                  restore
                </button>
                <button
                  type="button"
                  onClick={() => dispatch({ action: 'memory-delete', id: summary.id }, 'system')}
                >
                  forget
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {lastReport && <p className="context-inspector__memory-report">{lastReport.message}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="debug-row">
      <span className="debug-k">{label}</span>
      <span className="debug-v">{value}</span>
    </div>
  );
}
