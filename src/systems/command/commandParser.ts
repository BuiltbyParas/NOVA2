import type { NovaCommand, SpatialRelation } from '../../types/command';
import type { AppType } from '../../types/window';
import type { WorkspaceId } from '../../types/workspace';
import { APPS, APP_ORDER, genericAppFor } from '../../data/apps';
import { WORKSPACE_ORDER } from '../../data/workspaces';

/**
 * Phase 1 intent resolution.
 *
 * This is a deliberately small local matcher standing exactly where Gemini will
 * stand later. Its contract is the important part: text in, `NovaCommand[]` out.
 * When the model replaces it, nothing downstream changes — the model will be
 * asked to emit these same structured commands and will never be given access
 * to the scene.
 */

export interface Interpretation {
  commands: NovaCommand[];
  /** False when nothing matched, so the interface can say so honestly. */
  understood: boolean;
}

const WORKSPACE_ALIASES: Record<string, WorkspaceId> = {
  home: 'home',
  default: 'home',
  development: 'development',
  dev: 'development',
  coding: 'development',
  build: 'development',
  study: 'study',
  reading: 'study',
  research: 'study',
  writing: 'study',
};

const RELATION_PATTERNS: [RegExp, SpatialRelation][] = [
  [/\b(left of|to the left of|beside.*left)\b/, 'left_of'],
  [/\b(right of|to the right of)\b/, 'right_of'],
  [/\b(above|on top of|over)\b/, 'above'],
  [/\b(below|under|beneath)\b/, 'below'],
  [/\b(in front of|ahead of|closer than)\b/, 'in_front_of'],
  [/\b(behind|back of|further than)\b/, 'behind'],
];

function findApp(text: string, exclude?: AppType): AppType | null {
  let best: { app: AppType; index: number } | null = null;
  for (const app of APP_ORDER) {
    if (app === exclude) continue;
    for (const alias of APPS[app].aliases) {
      const index = text.indexOf(alias);
      if (index >= 0 && (!best || index < best.index)) best = { app, index };
    }
  }
  return best?.app ?? null;
}

function findWorkspace(text: string): WorkspaceId | null {
  for (const key of Object.keys(WORKSPACE_ALIASES)) {
    if (new RegExp(`\\b${key}\\b`).test(text)) return WORKSPACE_ALIASES[key];
  }
  return null;
}

/**
 * Text that is a path, a flag, or a shell fragment rather than a phrase.
 *
 * `findApp` scans for alias substrings, so "/bin/bash" contains "bash" and
 * "terminal -c something" contains "terminal". Neither is somebody naming an
 * application, and treating them as one is how a path came to focus a window.
 * Anything shaped like this is left unclaimed; the catalog will not match it
 * either, so NOVA says it could not resolve it — which is the truth.
 */
const PATH_OR_ARGUMENT = /[/\\;|&$`<>]|(?:^|\s)-{1,2}\w/;

export function interpret(input: string): Interpretation {
  const text = input.trim().toLowerCase();
  if (!text) return { commands: [], understood: false };
  if (PATH_OR_ARGUMENT.test(text)) return { commands: [], understood: false };

  // Phase 13: Spatial application layer navigation via text/voice
  if (/\b(next layer|forward layer|layer next)\b/.test(text)) {
    return { commands: [{ action: 'layer', direction: 'next' }], understood: true };
  }
  if (/\b(previous layer|prev layer|back layer|layer (back|prev|previous))\b/.test(text)) {
    return { commands: [{ action: 'layer', direction: 'previous' }], understood: true };
  }
  const layerGoMatch = /\b(?:layer|go to layer|show layer)\s+(\w+)\b/.exec(text);
  if (layerGoMatch) {
    const raw = layerGoMatch[1];
    const num = parseInt(raw, 10);
    const target = isNaN(num) ? raw : num - 1; // 1-based user input to 0-based index
    return { commands: [{ action: 'layer-go', target }], understood: true };
  }

  // Workspace switching, e.g. "open development workspace", "switch to study".
  if (/\b(workspace|switch|go to|enter|mode)\b/.test(text)) {
    const workspace = findWorkspace(text);
    if (workspace) return { commands: [{ action: 'workspace', target: workspace }], understood: true };
  }

  if (/\b(arrange|tidy|organi[sz]e|reset|clean up)\b/.test(text)) {
    return { commands: [{ action: 'arrange' }], understood: true };
  }

  // Relational placement, e.g. "move browser left of code".
  for (const [pattern, relation] of RELATION_PATTERNS) {
    if (!pattern.test(text)) continue;
    const [before, after] = text.split(pattern)[0] !== undefined ? splitOn(text, pattern) : ['', ''];
    const moving = findApp(before);
    const reference = findApp(after, moving ?? undefined);
    if (moving && reference) {
      return {
        commands: [
          { action: 'move', target: moving, relation, reference },
          { action: 'focus', target: moving },
        ],
        understood: true,
      };
    }
  }

  const app = findApp(text);

  if (/\b(close|dismiss|quit|remove)\b/.test(text) && app) {
    return { commands: [{ action: 'close', target: app }], understood: true };
  }
  if (/\b(minimi[sz]e|collapse|hide|stow)\b/.test(text) && app) {
    return { commands: [{ action: 'minimize', target: app }], understood: true };
  }
  if (/\b(restore|expand|show|bring back)\b/.test(text) && app) {
    return {
      commands: [
        { action: 'restore', target: app },
        { action: 'focus', target: app },
      ],
      understood: true,
    };
  }
  if (/\b(bigger|larger|grow|enlarge)\b/.test(text) && app) {
    return { commands: [{ action: 'scale', target: app, delta: 0.18 }], understood: true };
  }
  if (/\b(smaller|shrink|reduce)\b/.test(text) && app) {
    return { commands: [{ action: 'scale', target: app, delta: -0.18 }], understood: true };
  }
  if (/\b(closer|forward|pull)\b/.test(text) && app) {
    return { commands: [{ action: 'move', target: app, delta: { z: 0.8 } }], understood: true };
  }
  if (/\b(further|back|push|away)\b/.test(text) && app) {
    return { commands: [{ action: 'move', target: app, delta: { z: -0.8 } }], understood: true };
  }
  /**
   * Opening is the one verb that distinguishes a category from a product.
   *
   * The phrase after the verb must be a *category* name — "browser", not
   * "Chrome" — because NOVA's Browser surface is a stand-in for whatever
   * browser you have, while "Chrome" names one of them. Anything else is
   * deliberately left unclaimed so the installed-application catalog can
   * resolve it, which is where a real Chrome comes from.
   *
   * This returns early rather than falling through: the bare-name branch below
   * would otherwise claim "open Chrome" as `focus browser`, which is the same
   * mistake wearing a different verb.
   */
  const opening = /\b(?:open|launch|start)\b\s*(.*)$/.exec(text);
  if (opening) {
    const generic = genericAppFor(opening[1]);
    if (generic) return { commands: [{ action: 'open', target: generic }], understood: true };
    return { commands: [], understood: false };
  }
  if (app) {
    // Bare app name, or "focus code" — the most common instruction.
    return { commands: [{ action: 'focus', target: app }], understood: true };
  }

  const workspace = findWorkspace(text);
  if (workspace) return { commands: [{ action: 'workspace', target: workspace }], understood: true };

  return { commands: [], understood: false };
}

function splitOn(text: string, pattern: RegExp): [string, string] {
  const match = pattern.exec(text);
  if (!match) return [text, ''];
  return [text.slice(0, match.index), text.slice(match.index + match[0].length)];
}

/**
 * Example phrasings surfaced in the command line, kept next to the matcher.
 *
 * Ordered so the first row is what NOVA is for — opening a surface, opening a
 * real application, and acting on whatever is being pointed at — and the second
 * row is the spatial vocabulary. Every one of them is a phrasing the matcher
 * above actually handles, so a click is never a promise NOVA cannot keep.
 */
export const COMMAND_EXAMPLES = [
  'open terminal',
  'open this',
  'focus code',
  'move browser left of code',
  'arrange my workspace',
  'switch to study',
];

export const WORKSPACE_SUGGESTIONS = WORKSPACE_ORDER;
