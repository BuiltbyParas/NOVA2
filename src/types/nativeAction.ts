import type { AppType } from './window';

/**
 * The one thing NOVA may ask the computer to *do*.
 *
 * Phase 8 gave NOVA eyes. This is the first hand, and it is deliberately a
 * single finger: one capability, one closed set of subjects, and a vocabulary
 * that cannot express anything else. There is no `command`, no `path`, no
 * `args` and no `exec` anywhere in these types — not as an escape hatch, not as
 * an optional field. What cannot be said cannot be smuggled.
 *
 * The asymmetry with Phase 8 is intentional. Reading the host is broad and
 * cheap to make safe; acting on it is narrow and expensive to make safe, so the
 * write vocabulary is a fraction of the size of the read one.
 */

/**
 * Capabilities NOVA can request.
 *
 * A union of exactly one member today. Growing it is a deliberate act that
 * forces every `switch` over it to be revisited — which is the point.
 */
export type NativeCapability = 'OPEN_APPLICATION';

export const NATIVE_CAPABILITIES: readonly NativeCapability[] = ['OPEN_APPLICATION'] as const;

/**
 * An application identity NOVA may act on.
 *
 * Either one of NOVA's five spatial application types (`'terminal'`), or the
 * desktop entry id of an application discovered on the host
 * (`'com.spotify.Client'`). Never an executable, never a path, never a command
 * — there is no shape in this type that could carry one.
 *
 * Phase 9.5 widened this from the five types alone. The security boundary did
 * not move with it: a desktop id is accepted only after the *server* finds it
 * in the catalog it enumerated itself, and a client-side check is a courtesy
 * rather than the gate.
 */
export type ApplicationId = AppType | (string & {});

/**
 * What a caller may ask for.
 *
 * Two fields, both identities. The browser never learns an executable name or a
 * filesystem path, so it cannot name one. Turning an identity into something
 * the operating system understands happens entirely on the far side of the
 * boundary.
 */
export interface NativeActionRequest {
  capability: NativeCapability;
  applicationId: ApplicationId;
}

/**
 * Why an action did not happen.
 *
 * Every reason is a category, never a message from the operating system. A raw
 * exception could carry a path, a username or a command line, and none of those
 * belong in a browser.
 */
export type NativeActionReason =
  /** The capability is not one NOVA knows. */
  | 'INVALID_CAPABILITY'
  /** The application id is not a NOVA application identity. */
  | 'INVALID_APPLICATION_ID'
  /** A valid identity, but nothing approved for it is installed on this host. */
  | 'APPLICATION_NOT_AVAILABLE'
  /** No provider is reachable — NOVA is running as an ordinary web page. */
  | 'NATIVE_PROVIDER_UNAVAILABLE'
  /** A provider exists but does not offer this capability on this platform. */
  | 'CAPABILITY_UNAVAILABLE'
  /** The approved application was found and the launch itself failed. */
  | 'LAUNCH_FAILED';

export interface NativeActionResult {
  ok: boolean;
  capability: NativeCapability;
  applicationId: string;
  reason?: NativeActionReason;
  /**
   * One sentence for a person, composed by NOVA.
   *
   * Never an operating-system error string: those leak paths and arguments.
   */
  message?: string;
}

/**
 * A bounded record of what NOVA asked the computer to do.
 *
 * Development-only, and deliberately tiny. It holds what was requested and what
 * happened — never audio, never a command, never a path, never a credential.
 */
export interface NativeActionTrace {
  at: number;
  capability: NativeCapability;
  applicationId: string;
  ok: boolean;
  reason?: NativeActionReason;
}

/** Type guard used on both sides of the boundary. Validation is not trust. */
export function isNativeCapability(value: unknown): value is NativeCapability {
  return typeof value === 'string' && (NATIVE_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Is this one of NOVA's five *spatial* application types?
 *
 * Unchanged since Phase 9, and deliberately still narrow: it answers "does this
 * name a NOVA surface", not "may this be launched". `org.gnome.Ptyxis` is a
 * perfectly launchable application and is still not an `AppType`.
 */
const APPLICATION_IDS: readonly AppType[] = ['browser', 'code', 'files', 'notes', 'terminal'];

export function isApplicationId(value: unknown): value is AppType {
  return typeof value === 'string' && (APPLICATION_IDS as readonly string[]).includes(value);
}

/**
 * Could this be a desktop entry id?
 *
 * A *shape* check, mirroring the server's. It exists so an obviously malformed
 * identity never leaves the browser, and it is explicitly **not** the security
 * boundary: the server independently re-checks the shape and then requires
 * membership in its own enumeration of installed applications.
 *
 * Anything with a space, slash, semicolon, quote or shell metacharacter fails
 * here — which is every injection-shaped string, but the reason they are
 * ultimately refused is that no such application exists.
 */
const DESKTOP_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function hasDesktopIdShape(value: unknown): value is string {
  return typeof value === 'string' && DESKTOP_ID_SHAPE.test(value);
}

/**
 * Is this something NOVA could plausibly ask the host to open?
 *
 * True for a NOVA spatial type or a well-shaped desktop id. Says nothing about
 * whether the application is installed — only the server can answer that.
 */
export function isApplicationTarget(value: unknown): value is ApplicationId {
  return isApplicationId(value) || hasDesktopIdShape(value);
}

export function failedAction(
  capability: NativeCapability,
  applicationId: string,
  reason: NativeActionReason,
  message: string,
): NativeActionResult {
  return { ok: false, capability, applicationId, reason, message };
}
