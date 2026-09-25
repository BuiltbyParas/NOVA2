import type { AppType } from '../../types/window';

/**
 * Real applications, in NOVA's terms.
 *
 * Mapping is keyed on **stable application identifiers** — desktop entry ids and
 * executable names — and never on window titles. A title is whatever document
 * happens to be open; deciding that a window belongs to the editor because it
 * says "main.ts" would be a guess dressed as a fact, and would be wrong the
 * moment someone opens `main.ts` in a browser.
 *
 * The mapping is deliberately lossy in one direction only. Firefox, Chrome and
 * Brave are all `browser` to NOVA, while each keeps its own native id and name
 * alongside — so nothing is lost, and the category stays useful.
 *
 * Anything unrecognised is `unknown`. A wrong mapping is worse than none: it
 * would put a stranger's application inside a NOVA category that the context
 * engine, spatial memory and the intelligence layer all reason about.
 */

/**
 * Stable identifiers, lower-cased, without the `.desktop` suffix.
 *
 * Both reverse-DNS ids (`org.gnome.Nautilus`) and plain ones (`firefox`) appear,
 * because distributions and Flatpak disagree about which to use for the same
 * application.
 */
const BY_IDENTIFIER: Record<string, AppType> = {
  // --- browsers
  firefox: 'browser',
  'firefox-esr': 'browser',
  'org.mozilla.firefox': 'browser',
  librewolf: 'browser',
  'io.gitlab.librewolf-community': 'browser',
  'google-chrome': 'browser',
  chromium: 'browser',
  'chromium-browser': 'browser',
  'org.chromium.chromium': 'browser',
  'brave-browser': 'browser',
  'com.brave.browser': 'browser',
  brave: 'browser',
  'microsoft-edge': 'browser',
  'com.microsoft.edge': 'browser',
  vivaldi: 'browser',
  'vivaldi-stable': 'browser',
  epiphany: 'browser',
  'org.gnome.epiphany': 'browser',
  'com.google.chrome': 'browser',

  // --- editors and IDEs
  code: 'code',
  'code-oss': 'code',
  'com.visualstudio.code': 'code',
  codium: 'code',
  vscodium: 'code',
  'com.vscodium.codium': 'code',
  zed: 'code',
  'dev.zed.zed': 'code',
  'sublime_text': 'code',
  'com.sublimetext.three': 'code',
  'org.gnome.builder': 'code',
  'gnome-builder': 'code',
  'idea': 'code',
  'pycharm': 'code',
  'webstorm': 'code',

  // --- terminals
  'org.gnome.terminal': 'terminal',
  'gnome-terminal': 'terminal',
  'org.gnome.console': 'terminal',
  'gnome-console': 'terminal',
  kgx: 'terminal',
  'org.gnome.ptyxis': 'terminal',
  ptyxis: 'terminal',
  alacritty: 'terminal',
  'org.alacritty.alacritty': 'terminal',
  kitty: 'terminal',
  wezterm: 'terminal',
  'org.wezfurlong.wezterm': 'terminal',
  konsole: 'terminal',
  'org.kde.konsole': 'terminal',
  tilix: 'terminal',
  xterm: 'terminal',
  foot: 'terminal',

  // --- file managers
  nautilus: 'files',
  'org.gnome.nautilus': 'files',
  'org.gnome.files': 'files',
  dolphin: 'files',
  'org.kde.dolphin': 'files',
  thunar: 'files',
  nemo: 'files',
  'org.gnome.diskutility': 'files',

  // --- notes and text
  'org.gnome.texteditor': 'notes',
  'gnome-text-editor': 'notes',
  gedit: 'notes',
  'org.gnome.gedit': 'notes',
  'org.gnome.notes': 'notes',
  obsidian: 'notes',
  'md.obsidian.obsidian': 'notes',
  'org.gnome.gitlab.somas.apostrophe': 'notes',
  apostrophe: 'notes',
  xed: 'notes',
  'com.github.xournalpp.xournalpp': 'notes',
};

/**
 * Process names, as the kernel reports them.
 *
 * Linux truncates `/proc/<pid>/comm` to 15 characters, so `gnome-terminal-`
 * arrives clipped and `org.gnome.Terminal` never appears at all. These are the
 * short names, matched separately from desktop ids for that reason.
 */
const BY_PROCESS: Record<string, AppType> = {
  firefox: 'browser',
  'firefox-bin': 'browser',
  chrome: 'browser',
  chromium: 'browser',
  brave: 'browser',
  'brave-browser': 'browser',
  msedge: 'browser',
  vivaldi: 'browser',
  'vivaldi-bin': 'browser',
  epiphany: 'browser',
  librewolf: 'browser',

  code: 'code',
  codium: 'code',
  zed: 'code',
  'sublime_text': 'code',
  'gnome-builder': 'code',

  'gnome-terminal-': 'terminal',
  'gnome-terminal': 'terminal',
  kgx: 'terminal',
  ptyxis: 'terminal',
  alacritty: 'terminal',
  kitty: 'terminal',
  'wezterm-gui': 'terminal',
  konsole: 'terminal',
  tilix: 'terminal',
  xterm: 'terminal',
  foot: 'terminal',

  nautilus: 'files',
  dolphin: 'files',
  thunar: 'files',
  nemo: 'files',

  'gnome-text-edito': 'notes',
  'gnome-text-editor': 'notes',
  gedit: 'notes',
  obsidian: 'notes',
  apostrophe: 'notes',
};

const normalise = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\.desktop$/, '');

/**
 * NOVA's category for a stable application identifier.
 *
 * Returns `unknown` rather than a best effort. Callers are expected to keep the
 * native identity regardless — an application NOVA has no category for is still
 * a real application, and pretending otherwise would lose it.
 */
export function appTypeForIdentifier(identifier: string): AppType | 'unknown' {
  if (!identifier) return 'unknown';
  return BY_IDENTIFIER[normalise(identifier)] ?? 'unknown';
}

/**
 * NOVA's category for a process name.
 *
 * Handles the kernel's 15-character truncation by also accepting a known name
 * that starts with what was reported, which is how `gnome-terminal-` resolves.
 */
export function appTypeForProcess(processName: string): AppType | 'unknown' {
  if (!processName) return 'unknown';
  const name = normalise(processName);

  const exact = BY_PROCESS[name];
  if (exact) return exact;

  if (name.length >= 15) {
    for (const [known, type] of Object.entries(BY_PROCESS)) {
      if (known.startsWith(name)) return type;
    }
  }
  return 'unknown';
}

/**
 * The best category available from whatever identifiers are to hand.
 *
 * The desktop id is tried first because it is the more stable of the two: a
 * process name is whatever the binary happens to be called, and several
 * applications ship binaries named after something else entirely.
 */
export function resolveAppType(input: {
  desktopId?: string;
  executable?: string;
  processName?: string;
}): AppType | 'unknown' {
  const fromDesktop = input.desktopId ? appTypeForIdentifier(input.desktopId) : 'unknown';
  if (fromDesktop !== 'unknown') return fromDesktop;

  const fromExecutable = input.executable ? appTypeForIdentifier(input.executable) : 'unknown';
  if (fromExecutable !== 'unknown') return fromExecutable;

  const fromExecutableProcess = input.executable ? appTypeForProcess(input.executable) : 'unknown';
  if (fromExecutableProcess !== 'unknown') return fromExecutableProcess;

  return input.processName ? appTypeForProcess(input.processName) : 'unknown';
}
