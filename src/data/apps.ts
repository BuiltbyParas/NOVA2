import type { AppType } from '../types/window';

export interface AppDefinition {
  id: AppType;
  name: string;
  /** Default document title shown in the window chrome. */
  title: string;
  /** Intrinsic size in spatial units at scale 1. */
  width: number;
  height: number;
  /** Restrained per-app tint, used only for the chrome mark and focus trace. */
  tint: string;
  /** Words the command line accepts for this app. */
  aliases: string[];
}

export const APPS: Record<AppType, AppDefinition> = {
  browser: {
    id: 'browser',
    name: 'Browser',
    title: 'nova://spatial-computing',
    width: 2.74,
    height: 1.78,
    tint: '#5B5CE2',
    aliases: ['browser', 'web', 'internet', 'chrome', 'firefox'],
  },
  code: {
    id: 'code',
    name: 'Code',
    title: 'interaction-system.ts',
    width: 2.92,
    height: 1.86,
    tint: '#3F8F6E',
    aliases: ['code', 'editor', 'ide', 'vscode', 'dev'],
  },
  files: {
    id: 'files',
    name: 'Files',
    title: '~/nova',
    width: 2.48,
    height: 1.64,
    tint: '#B07C3A',
    aliases: ['files', 'finder', 'file manager', 'explorer', 'folders'],
  },
  notes: {
    id: 'notes',
    name: 'Notes',
    title: 'Spatial interface — notes',
    width: 2.26,
    height: 1.72,
    tint: '#9A5BA8',
    aliases: ['notes', 'note', 'writing', 'document', 'doc'],
  },
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    title: 'zsh — nova',
    width: 2.58,
    height: 1.6,
    tint: '#4A4E55',
    aliases: ['terminal', 'shell', 'console', 'zsh', 'bash'],
  },
};

export const APP_ORDER: AppType[] = ['browser', 'code', 'files', 'notes', 'terminal'];

/**
 * The *category* words for each spatial application — as opposed to the brand
 * names that also appear in `aliases`.
 *
 * `aliases` deliberately mixes the two, because "open chrome" and "move chrome
 * left" should both find NOVA's Browser surface when that is all NOVA has. Once
 * NOVA can see the real computer, though, the two stop meaning the same thing:
 *
 *     "open browser"  → NOVA's Browser surface        (a category)
 *     "open Chrome"   → the Chrome that is installed  (a product)
 *
 * Collapsing the second into the first is how "open Chrome" came to launch
 * Firefox. So opening — and only opening — distinguishes them: a category word
 * resolves to the spatial application, and anything else is offered to the
 * installed-application catalog.
 *
 * Every other command (`move`, `scale`, `focus`, `close` …) still uses the full
 * alias list, because those act on NOVA's own windows and always did.
 */
export const GENERIC_APP_NAMES: Record<AppType, readonly string[]> = {
  browser: ['browser', 'web browser', 'web', 'internet'],
  code: ['code', 'code editor', 'editor', 'ide'],
  files: ['files', 'file manager', 'folders', 'explorer'],
  notes: ['notes', 'note', 'writing', 'document', 'doc'],
  terminal: ['terminal', 'shell', 'console'],
};

/**
 * What was *removed* from the alias lists to get here, and why:
 *
 *   chrome, firefox   — browsers, not "the browser"
 *   vscode            — an editor, not "the editor"
 *   finder            — a file manager on a different operating system
 *   zsh, bash         — programs, and the reason "/bin/bash" once focused a window
 *   dev               — a workspace name as often as an application one
 *
 * Every one of those now reaches the installed-application catalog instead,
 * which is where a real Chrome, Firefox or VS Code actually lives. Everything
 * else is unchanged, so the phrasings people already use still work.
 */

/** Words that name no application in particular. */
const NAME_FILLER = new Set(['the', 'a', 'an', 'my', 'app', 'application', 'please']);

/**
 * Which spatial application is this phrase the *category name* of?
 *
 * Matches the whole phrase rather than scanning it, so "terminal" resolves and
 * "terminal -c something", "/bin/bash" and "Visual Studio Code" do not. Returns
 * null for anything else, which is what lets the catalog answer instead.
 */
export function genericAppFor(phrase: string): AppType | null {
  const cleaned = phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !NAME_FILLER.has(word))
    .join(' ')
    .trim();

  if (!cleaned) return null;
  for (const app of APP_ORDER) {
    if (GENERIC_APP_NAMES[app].includes(cleaned)) return app;
  }
  return null;
}
