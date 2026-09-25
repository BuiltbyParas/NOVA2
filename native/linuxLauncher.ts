import { spawn } from 'node:child_process';
import { listInstalledApplications, resolveDesktopEntryPath } from './linuxProvider.ts';

/**
 * Launching one approved application on a Linux desktop.
 *
 * ── Why this file is separate from `linuxProvider.ts` ────────────────────────
 * That file reads the host and is read-only by construction. This one acts. The
 * two paths are kept in different files so the read path cannot grow a write by
 * accident, and so "what can NOVA do to this computer" is answerable by reading
 * a single short file.
 *
 * ── Why this is not arbitrary execution ──────────────────────────────────────
 * The caller supplies an application *identity*: either one of NOVA's five
 * spatial application types, or the desktop entry id of an application that is
 * actually installed. It can never supply a command, a path or an argument.
 *
 * An identity is accepted only after **three independent checks**, in order:
 *
 *   1. shape      — a bare desktop id, with no separator, space or shell character
 *   2. membership — present in the catalog *this server itself enumerated* from
 *                   the desktop-entry directories a moment ago
 *   3. resolution — the read-only provider locates the entry file on disk
 *
 * Check 2 is the authority. A string that merely looks like a desktop id is
 * refused: it has to be an application that is really installed, and the list
 * of those comes from the filesystem rather than from the request. A regex
 * alone would not be validation, only spelling.
 *
 * The spawn is:
 *
 *     spawn('gio', ['launch', <path resolved here>], { shell: false })
 *
 * The program name is a constant. The argument vector is a constant plus one
 * path this file computed from its own allowlist. `shell` is false, so nothing
 * is ever parsed by a shell: a semicolon, a backtick or `$(…)` inside any
 * string would be an ordinary character in an argument, not a command. There is
 * no `exec`, no `execSync`, no `sh -c`, and no function here that takes a
 * command from anywhere.
 *
 * `gio launch` is the desktop's own activation path. It reads the entry's
 * `Exec` line, applies XDG semantics and handles Flatpak entries correctly —
 * rather than NOVA constructing a command line of its own, which is exactly the
 * thing this design exists to avoid.
 */

/** NOVA application identities. Mirrors `AppType`; duplicated because this file runs in Node. */
export type LaunchableId = 'browser' | 'code' | 'files' | 'notes' | 'terminal';

const LAUNCHABLE_IDS: readonly LaunchableId[] = ['browser', 'code', 'files', 'notes', 'terminal'];

/**
 * Which desktop entry backs each of NOVA's five *spatial* applications.
 *
 * Hardcoded on the server in preference order — the first one actually
 * installed wins. This is how `terminal` becomes `org.gnome.Ptyxis` without the
 * browser ever naming a desktop entry, and it is unchanged from Phase 9.
 *
 * Applications outside these five are reached by desktop id instead, validated
 * against the enumerated catalog rather than against this table.
 */
const ALLOWLIST: Record<LaunchableId, readonly string[]> = {
  terminal: [
    'org.gnome.Ptyxis',
    'org.gnome.Console',
    'org.gnome.Terminal',
    'kgx',
    'org.kde.konsole',
    'Alacritty',
    'alacritty',
    'kitty',
    'foot',
  ],
  browser: [
    'firefox',
    'org.mozilla.firefox',
    'com.brave.Browser',
    'com.google.Chrome',
    'google-chrome',
    'chromium-browser',
    'org.chromium.Chromium',
    'com.microsoft.Edge',
    'org.gnome.Epiphany',
  ],
  code: [
    'com.visualstudio.code',
    'code',
    'code-oss',
    'dev.zed.Zed',
    'org.gnome.Builder',
  ],
  files: [
    'org.gnome.Nautilus',
    'nautilus',
    'org.kde.dolphin',
    'thunar',
    'nemo',
  ],
  notes: [
    'org.gnome.TextEditor',
    'org.gnome.gedit',
    'gedit',
    'org.gnome.Notes',
    'md.obsidian.Obsidian',
  ],
};

/** The launcher binary. A constant; never composed, never taken from input. */
const LAUNCH_PROGRAM = 'gio';

export type LaunchOutcome =
  | { ok: true; desktopId: string }
  | { ok: false; reason: 'INVALID_APPLICATION_ID' | 'APPLICATION_NOT_AVAILABLE' | 'LAUNCH_FAILED' };

export function isLaunchableId(value: unknown): value is LaunchableId {
  return typeof value === 'string' && (LAUNCHABLE_IDS as readonly string[]).includes(value);
}

/**
 * Could this string be a desktop entry id at all?
 *
 * A shape check and nothing more — deliberately the *weakest* of the three
 * gates, and never sufficient on its own. It exists to reject obvious nonsense
 * before touching the catalog: anything with a space, a slash, a semicolon, a
 * quote or a shell metacharacter fails here, which covers `/bin/bash`,
 * `bash -c id`, `spotify; rm -rf /` and `../../etc/passwd`.
 */
const DESKTOP_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function hasDesktopIdShape(value: unknown): value is string {
  return typeof value === 'string' && DESKTOP_ID_SHAPE.test(value);
}

/**
 * The enumerated catalog, cached briefly.
 *
 * Re-read rather than trusted indefinitely, so an application uninstalled while
 * NOVA is running stops being launchable. The window is short enough that the
 * catalog cannot drift far and long enough that a burst of requests does not
 * rescan the disk repeatedly.
 */
const CATALOG_TTL_MS = 10_000;
let catalogCache: { at: number; ids: Set<string> } | null = null;

async function installedIds(): Promise<Set<string>> {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) return catalogCache.ids;

  const applications = await listInstalledApplications();
  const ids = new Set(applications.map((application) => application.id));
  catalogCache = { at: now, ids };
  return ids;
}

/** Test seam: drop the cached catalog so the next call re-enumerates. */
export function resetCatalogCache() {
  catalogCache = null;
}

/**
 * Is this the id of an application that is genuinely installed?
 *
 * The authoritative check. Shape first (cheap, and keeps obvious junk away from
 * the catalog), then membership in what the server itself enumerated.
 */
export async function isInstalledApplicationId(value: unknown): Promise<boolean> {
  if (!hasDesktopIdShape(value)) return false;
  return (await installedIds()).has(value);
}

/**
 * Which approved application backs this identity on this host, if any.
 *
 * Read-only and safe to call freely — it is also how the server reports whether
 * the capability is available at all, without launching anything.
 */
export async function findApprovedApplication(
  id: LaunchableId,
): Promise<{ desktopId: string; desktopPath: string } | null> {
  for (const desktopId of ALLOWLIST[id]) {
    const desktopPath = await resolveDesktopEntryPath(desktopId);
    if (desktopPath) return { desktopId, desktopPath };
  }
  return null;
}

/** Which NOVA identities have an approved application installed here. */
export async function launchableApplications(): Promise<Record<LaunchableId, string | null>> {
  const available = {} as Record<LaunchableId, string | null>;
  for (const id of LAUNCHABLE_IDS) {
    available[id] = (await findApprovedApplication(id))?.desktopId ?? null;
  }
  return available;
}

/**
 * Launch the approved application for a NOVA identity.
 *
 * Detached and unreferenced, with stdio ignored: the application outlives NOVA,
 * NOVA never reads its output, and the server does not wait on it. A launch
 * that fails is reported as a category — never as the operating system's own
 * error text, which could carry a path or a username.
 */
export async function launchApplication(id: unknown): Promise<LaunchOutcome> {
  let desktopId: string;
  let desktopPath: string;

  if (isLaunchableId(id)) {
    // One of NOVA's five spatial applications: resolved through the preference
    // table exactly as it was in Phase 9.
    const approved = await findApprovedApplication(id);
    if (!approved) return { ok: false, reason: 'APPLICATION_NOT_AVAILABLE' };
    desktopId = approved.desktopId;
    desktopPath = approved.desktopPath;
  } else if (hasDesktopIdShape(id) && (await isInstalledApplicationId(id))) {
    // A discovered application. It reached here only by being present in the
    // catalog this server enumerated from disk.
    const resolved = await resolveDesktopEntryPath(id);
    if (!resolved) return { ok: false, reason: 'APPLICATION_NOT_AVAILABLE' };
    desktopId = id;
    desktopPath = resolved;
  } else {
    // Wrong shape, or a well-formed id for something that is not installed.
    return hasDesktopIdShape(id)
      ? { ok: false, reason: 'APPLICATION_NOT_AVAILABLE' }
      : { ok: false, reason: 'INVALID_APPLICATION_ID' };
  }

  try {
    const child = spawn(LAUNCH_PROGRAM, ['launch', desktopPath], {
      // No shell. The argument vector is passed to execvp as-is, so no string
      // in it can ever be interpreted as a command.
      shell: false,
      detached: true,
      stdio: 'ignore',
    });

    // A spawn error (the launcher missing, for instance) arrives asynchronously
    // and would otherwise be an unhandled event on the child process.
    child.on('error', () => {
      /* reported below as LAUNCH_FAILED on the synchronous path where possible */
    });

    if (typeof child.pid !== 'number') return { ok: false, reason: 'LAUNCH_FAILED' };

    child.unref();
    return { ok: true, desktopId };
  } catch {
    return { ok: false, reason: 'LAUNCH_FAILED' };
  }
}
