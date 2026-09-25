import { create } from 'zustand';
import type {
  NativeActionReason,
  NativeActionRequest,
  NativeActionResult,
  NativeActionTrace,
  NativeCapability,
} from '../../types/nativeAction';
import { failedAction, isApplicationTarget, isNativeCapability } from '../../types/nativeAction';
import { noteLaunchRequest } from './nativeSpatialSync';

/**
 * Asking the computer to open an application.
 *
 * The browser half of Phase 9's one capability. It validates before sending and
 * validates what comes back, for the same reason the Phase 8 bridge does: this
 * is a network hop, and a network hop is not a trust relationship.
 *
 * Nothing here decides *whether* to act — that is the command bus's job. This
 * only carries a request across the boundary and reports what happened.
 */

export const NATIVE_ACTION_ENDPOINT = '/api/native/action';

/** A launch that has not answered by now is treated as failed rather than waited on. */
const TIMEOUT_MS = 6_000;

/**
 * A bounded record of what NOVA asked the computer to do.
 *
 * Development instrumentation, kept short on purpose. It holds a capability, an
 * application identity and an outcome — never audio, never a command, never a
 * path, never a credential, because none of those exist at this layer to record.
 */
const TRACE_LIMIT = 8;

interface ActionTraceState {
  traces: NativeActionTrace[];
  record: (trace: NativeActionTrace) => void;
  clear: () => void;
}

export const useNativeActionStore = create<ActionTraceState>((set) => ({
  traces: [],
  record: (trace) => set((state) => ({ traces: [trace, ...state.traces].slice(0, TRACE_LIMIT) })),
  clear: () => set({ traces: [] }),
}));

function trace(result: NativeActionResult, at: number) {
  useNativeActionStore.getState().record({
    at,
    capability: result.capability,
    applicationId: result.applicationId,
    ok: result.ok,
    ...(result.reason ? { reason: result.reason } : {}),
  });

  /**
   * Tell the synchronisation layer a launch was asked for.
   *
   * This is the single funnel every launch passes through, so recording here
   * cannot miss one and cannot invent one. It records the *asking* — the
   * launcher accepting a request says nothing about whether the application
   * started, which is exactly why the lifecycle keeps the two apart until a
   * snapshot shows a live process.
   */
  if (result.capability === 'OPEN_APPLICATION' && result.applicationId) {
    noteLaunchRequest(result.applicationId, result.ok, at);
  }
}

/** Rebuild the server's reply as a `NativeActionResult`, trusting none of it. */
function normalizeResult(
  raw: unknown,
  request: NativeActionRequest,
): NativeActionResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return failedAction(
      request.capability,
      request.applicationId,
      'LAUNCH_FAILED',
      'The native provider returned something unreadable.',
    );
  }

  const reply = raw as Record<string, unknown>;
  if (reply.ok === true) {
    return { ok: true, capability: request.capability, applicationId: request.applicationId };
  }

  const KNOWN: readonly NativeActionReason[] = [
    'INVALID_CAPABILITY',
    'INVALID_APPLICATION_ID',
    'APPLICATION_NOT_AVAILABLE',
    'NATIVE_PROVIDER_UNAVAILABLE',
    'CAPABILITY_UNAVAILABLE',
    'LAUNCH_FAILED',
  ];
  const reported = typeof reply.reason === 'string' ? reply.reason : '';
  // An unrecognised reason from the server is not passed through as though NOVA
  // understood it; it becomes the generic failure.
  const reason: NativeActionReason = (KNOWN as readonly string[]).includes(reported)
    ? (reported as NativeActionReason)
    : 'LAUNCH_FAILED';
  const message =
    typeof reply.message === 'string' && reply.message.length < 200
      ? reply.message
      : 'The application could not be launched.';

  return failedAction(request.capability, request.applicationId, reason, message);
}

/**
 * Perform one native action.
 *
 * Validates the request locally first — a caller that has somehow constructed a
 * capability or an application id outside the unions is refused without a
 * network request at all, so a malformed call cannot even reach the boundary.
 *
 * Never throws. A missing provider, a slow one, or a reply that is not JSON all
 * resolve to a structured failure, because the spatial environment must keep
 * working whatever the operating system does.
 */
export async function requestNativeAction(
  request: NativeActionRequest,
  at: number = Date.now(),
): Promise<NativeActionResult> {
  if (!isNativeCapability(request.capability)) {
    const result = failedAction(
      request.capability as NativeCapability,
      String(request.applicationId ?? ''),
      'INVALID_CAPABILITY',
      'NOVA does not have that capability.',
    );
    trace(result, at);
    return result;
  }

  // A shape check only — the server re-checks it and then requires the
  // application to be genuinely installed. Refusing here just avoids sending
  // something that could never be valid.
  if (!isApplicationTarget(request.applicationId)) {
    const result = failedAction(
      request.capability,
      '',
      'INVALID_APPLICATION_ID',
      'That is not a valid application identity.',
    );
    trace(result, at);
    return result;
  }

  if (typeof fetch !== 'function') {
    const result = failedAction(
      request.capability,
      request.applicationId,
      'NATIVE_PROVIDER_UNAVAILABLE',
      'No native provider is reachable.',
    );
    trace(result, at);
    return result;
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;

  try {
    const response = await fetch(NATIVE_ACTION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Exactly two fields, both from closed sets. There is nothing else to send.
      body: JSON.stringify({
        capability: request.capability,
        applicationId: request.applicationId,
      }),
      ...(controller ? { signal: controller.signal } : {}),
    });

    if (response.status === 404) {
      const result = failedAction(
        request.capability,
        request.applicationId,
        'NATIVE_PROVIDER_UNAVAILABLE',
        'No native provider is running. Start NOVA with `npx tsx server.ts`.',
      );
      trace(result, at);
      return result;
    }

    const result = normalizeResult(await response.json(), request);
    trace(result, at);
    return result;
  } catch {
    const result = failedAction(
      request.capability,
      request.applicationId,
      'NATIVE_PROVIDER_UNAVAILABLE',
      'The native provider did not answer.',
    );
    trace(result, at);
    return result;
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
