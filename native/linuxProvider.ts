import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Read-only awareness of a Linux host.
 *
 * ── The safety argument ──────────────────────────────────────────────────────
 * This file reads four things and does nothing else:
 *
 *   1. `os.platform()` / `os.release()`          — the kernel, via Node, no process
 *   2. `/etc/os-release`                          — the distribution's own name file
 *   3. XDG session environment variables          — desktop and session type
 *   4. XDG desktop-entry directories              — which applications are installed
 *   5. `/proc/<pid>/comm`                         — which of them are running
 *
 * It spawns no processes. There is no `exec`, no `spawn`, no shell, no DBus call
 * and no X11 fallback anywhere in it, and it takes no arguments from the caller,
 * so it cannot be steered into reading a path somebody chose. Every path it
 * touches is a fixed constant declared below.
 *
 * `/proc/<pid>/comm` is read; `/proc/<pid>/cmdline` deliberately is not. `comm`
 * is a truncated program name, while `cmdline` carries arguments — which
 * routinely contain file paths, API tokens and passwords. NOVA has no business
 * seeing those, so it does not read them.
 *
 * Only applications with a desktop entry are ever reported. A running process
 * that is not an installed application is never named, so this cannot be used
 * to enumerate somebody's daemons or background services.
 *
 * ── What it cannot do ────────────────────────────────────────────────────────
 * Native *window* enumeration. Under Wayland the compositor does not expose the
 * window list to unprivileged clients, and every route around that — GNOME
 * Shell's `Eval`, an X11 fallback via XWayland, a shell out to `wmctrl` — is
 * either disabled, a security bypass, or both. So the capability is reported
 * false with a reason, which is the honest answer rather than a missing one.
 */

// --- the complete set of paths this file will ever read ---------------------

const OS_RELEASE = '/etc/os-release';
const PROC = '/proc';

function desktopEntryDirectories(): string[] {
  const home = os.homedir();
  const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':');

  return [
    path.join(dataHome, 'applications'),
    ...dataDirs.filter(Boolean).map((dir) => path.join(dir, 'applications')),
    '/var/lib/flatpak/exports/share/applications',
    path.join(dataHome, 'flatpak', 'exports', 'share', 'applications'),
  ];
}

/** Bounds, so a strange host cannot turn a snapshot into an expensive scan. */
const MAX_APPLICATIONS = 250;
const MAX_PROCESSES = 4_000;

// --- the shape this provider reports ----------------------------------------
// Intentionally its own types rather than NOVA's: this runs in Node, on the far
// side of a network boundary, and the browser validates whatever arrives. NOVA's
// vocabulary (AppType and friends) is applied there, not here.

export interface ProviderApplication {
  id: string;
  name: string;
  exec?: string;
  running: boolean;
}

export interface ProviderReport {
  providerId: string;
  at: number;
  platform: string;
  osName?: string;
  osVersion?: string;
  desktopEnvironment?: string;
  sessionType?: string;
  capabilities: {
    platformDetection: boolean;
    applicationEnumeration: boolean;
    runningProcessDetection: boolean;
    windowEnumeration: boolean;
    windowGeometry: boolean;
    workspaceEnumeration: boolean;
  };
  applications: ProviderApplication[];
  windows: never[];
  notes: string[];
}

// --- readers ----------------------------------------------------------------

async function readOsRelease(): Promise<{ name?: string; version?: string }> {
  try {
    const text = await readFile(OS_RELEASE, 'utf8');
    const fields: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (match) fields[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
    }
    return { name: fields.NAME, version: fields.VERSION_ID };
  } catch {
    return {};
  }
}

function readSession(): { desktop?: string; session?: string } {
  const desktop =
    process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION || process.env.GDMSESSION;
  const session = process.env.XDG_SESSION_TYPE;
  return {
    desktop: desktop ? desktop.split(':')[0] : undefined,
    session: session || undefined,
  };
}

/** The first token of an `Exec=` line, without arguments or field codes. */
function executableFrom(exec: string): string | undefined {
  const first = exec.trim().split(/\s+/)[0];
  if (!first) return undefined;
  const base = path.basename(first);
  // `env FOO=bar app` and similar wrappers name the wrong thing.
  if (base === 'env' || base === 'sh' || base === 'bash' || base === 'flatpak') return undefined;
  return base;
}

interface DesktopEntry {
  id: string;
  name: string;
  exec?: string;
}

function parseDesktopEntry(id: string, text: string): DesktopEntry | null {
  let inEntry = false;
  let name: string | undefined;
  let exec: string | undefined;
  let type: string | undefined;
  let hidden = false;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('[')) {
      inEntry = line === '[Desktop Entry]';
      continue;
    }
    if (!inEntry || !line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    // Only the unlocalised keys: `Name[de]` is the same application.
    if (key === 'Name' && name === undefined) name = value;
    else if (key === 'Exec' && exec === undefined) exec = value;
    else if (key === 'Type') type = value;
    else if ((key === 'NoDisplay' || key === 'Hidden') && value.toLowerCase() === 'true') {
      hidden = true;
    }
  }

  if (hidden) return null;
  if (type && type !== 'Application') return null;
  if (!name) return null;

  return { id, name, exec: exec ? executableFrom(exec) : undefined };
}

async function readDesktopEntries(): Promise<{ entries: DesktopEntry[]; scanned: number }> {
  const seen = new Map<string, DesktopEntry>();
  let scanned = 0;

  for (const dir of desktopEntryDirectories()) {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue; // a directory that does not exist is not an error
    }

    for (const file of files) {
      if (!file.endsWith('.desktop')) continue;
      const id = file.replace(/\.desktop$/, '');
      // Earlier directories win, matching XDG precedence.
      if (seen.has(id)) continue;
      if (seen.size >= MAX_APPLICATIONS) break;

      scanned += 1;
      try {
        const entry = parseDesktopEntry(id, await readFile(path.join(dir, file), 'utf8'));
        if (entry) seen.set(id, entry);
      } catch {
        // An unreadable entry is skipped, never fatal.
      }
    }
  }

  return { entries: [...seen.values()], scanned };
}

/**
 * The set of running program names.
 *
 * `comm` only — never `cmdline`, which carries arguments and therefore secrets.
 * The result is a set of bare program names and nothing that identifies a
 * process, a user or a file.
 */
async function readRunningProcessNames(): Promise<Set<string> | null> {
  let entries: string[];
  try {
    entries = await readdir(PROC);
  } catch {
    return null;
  }

  const names = new Set<string>();
  let examined = 0;

  for (const entry of entries) {
    if (examined >= MAX_PROCESSES) break;
    if (!/^\d+$/.test(entry)) continue;
    examined += 1;
    try {
      const comm = await readFile(path.join(PROC, entry, 'comm'), 'utf8');
      const name = comm.trim();
      if (name) names.add(name.toLowerCase());
    } catch {
      // Processes exit while being listed. Entirely expected.
    }
  }

  return names;
}

/**
 * Segments of a reverse-DNS id that identify nothing on their own.
 *
 * `com.brave.Browser` carries the program name in its middle segment, which is
 * how a Flatpak application is matched to its process at all. But `com`, `org`
 * and `github` would match anything, so they are never treated as names.
 */
const GENERIC_SEGMENTS = new Set([
  'com', 'org', 'io', 'net', 'dev', 'app', 'me', 'xyz', 'eu', 'fr', 'de',
  'github', 'gitlab', 'flathub', 'desktop', 'gnome', 'kde', 'freedesktop',
]);

/**
 * Which names could a process for this application plausibly have?
 *
 * Three sources, in descending reliability: the executable from `Exec=`, the
 * desktop id itself, and — for reverse-DNS ids — each meaningful segment of it.
 * That last rule is what connects `com.brave.Browser` to a process called
 * `brave`, which is how every Flatpak application on the host is packaged.
 */
function processCandidates(entry: DesktopEntry): string[] {
  const candidates = new Set<string>();
  if (entry.exec) candidates.add(entry.exec.toLowerCase());

  const id = entry.id.toLowerCase();
  candidates.add(id);

  if (id.includes('.')) {
    for (const segment of id.split('.')) {
      if (segment.length >= 4 && !GENERIC_SEGMENTS.has(segment)) candidates.add(segment);
    }
  }
  return [...candidates];
}

/** Does any running program name correspond to this desktop entry? */
function isRunning(entry: DesktopEntry, running: Set<string>): boolean {
  for (const candidate of processCandidates(entry)) {
    if (running.has(candidate)) return true;
    // The kernel truncates `comm` to 15 characters, so a longer program name
    // arrives clipped and must be matched against its own first 15.
    if (candidate.length > 15 && running.has(candidate.slice(0, 15))) return true;
  }
  return false;
}

/**
 * Where an installed desktop entry lives, if it exists.
 *
 * A **read**, which is why it sits in the read-only provider: it opens nothing,
 * runs nothing, and answers only "is this id installed, and in which directory".
 * The launcher uses it to turn an approved identity into a path *on the server*,
 * so no path ever has to cross the boundary to the browser.
 *
 * `id` is matched exactly against a filename. It is never interpolated into a
 * command, and callers are expected to have already checked it against an
 * allowlist — but the `path.basename` guard below means a traversal attempt
 * cannot escape these directories even if one does not.
 */
export async function resolveDesktopEntryPath(id: string): Promise<string | null> {
  // Reject anything that is not a bare desktop id before touching the disk.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) return null;
  if (path.basename(id) !== id) return null;

  for (const dir of desktopEntryDirectories()) {
    const candidate = path.join(dir, `${id}.desktop`);
    try {
      const text = await readFile(candidate, 'utf8');
      // Must be a launchable application entry, not a link or a hidden stub.
      if (parseDesktopEntry(id, text)) return candidate;
    } catch {
      // Not in this directory. Keep looking.
    }
  }
  return null;
}

/**
 * Every installed application, as ids and names.
 *
 * A **read**, and the same scan the snapshot performs — exposed separately so
 * the launcher can check an id against what is genuinely installed rather than
 * against a pattern. This is the authority for "may this be launched": an id
 * that is not in this list does not exist as far as NOVA is concerned.
 */
export async function listInstalledApplications(): Promise<Array<{ id: string; name: string }>> {
  const { entries } = await readDesktopEntries();
  return entries.map((entry) => ({ id: entry.id, name: entry.name }));
}

// --- the provider -----------------------------------------------------------

/**
 * Look at the host, once.
 *
 * Never throws: a failure in any one reader turns its capability off and adds a
 * note, because a spatial environment must not fall over because a directory
 * was unreadable.
 */
export async function readLinuxSnapshot(): Promise<ProviderReport> {
  const at = Date.now();
  const platform = process.platform;
  const notes: string[] = [];

  const report: ProviderReport = {
    providerId: 'linux',
    at,
    platform,
    sessionType: undefined,
    capabilities: {
      platformDetection: false,
      applicationEnumeration: false,
      runningProcessDetection: false,
      windowEnumeration: false,
      windowGeometry: false,
      workspaceEnumeration: false,
    },
    applications: [],
    windows: [],
    notes,
  };

  if (platform !== 'linux') {
    notes.push(`This provider supports Linux; the host reports "${platform}".`);
    report.providerId = 'unsupported';
    return report;
  }

  // 1. Platform and session.
  const { name, version } = await readOsRelease();
  const { desktop, session } = readSession();
  report.osName = name;
  report.osVersion = version;
  report.desktopEnvironment = desktop;
  report.sessionType = session;
  report.capabilities.platformDetection = true;

  // 2. Installed applications.
  try {
    const { entries } = await readDesktopEntries();
    if (entries.length) {
      report.capabilities.applicationEnumeration = true;
      report.applications = entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        exec: entry.exec,
        running: false,
      }));
    } else {
      notes.push('No desktop entries were readable, so installed applications are unknown.');
    }
  } catch {
    notes.push('Reading desktop entries failed; installed applications are unknown.');
  }

  // 3. Which of them are running.
  const running = await readRunningProcessNames();
  if (running) {
    report.capabilities.runningProcessDetection = true;
    for (const application of report.applications) {
      const entry: DesktopEntry = {
        id: application.id,
        name: application.name,
        exec: application.exec,
      };
      application.running = isRunning(entry, running);
    }
  } else {
    notes.push('/proc is not readable, so running applications cannot be detected.');
  }

  // 4. Windows — and why not.
  const sessionType = (session ?? '').toLowerCase();
  if (sessionType === 'wayland') {
    notes.push(
      'Native window enumeration is unavailable under Wayland: the compositor does not ' +
        'expose the window list to unprivileged clients. Reaching it would require a GNOME ' +
        'Shell extension, or bypassing the session security model, and NOVA does neither.',
    );
  } else if (sessionType === 'x11') {
    notes.push(
      'Native window enumeration under X11 is not implemented. It is technically reachable, ' +
        'but Phase 8 is read-only awareness and did not add an X11-only path.',
    );
  } else {
    notes.push('Session type is unknown, so native window enumeration was not attempted.');
  }

  return report;
}
