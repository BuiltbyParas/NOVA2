import type { AppType } from '../../types/window';
import { genericAppFor } from '../../data/apps';
import { nativeState } from './nativeStore';

/**
 * Turning what a person called an application into a stable identity.
 *
 * NOVA already receives a catalog of every installed desktop application from
 * the Phase 8 snapshot. This resolves a spoken or typed name against that
 * catalog and returns a **desktop entry id** — `com.spotify.Client`, not
 * `spotify`, not `/usr/bin/spotify`, and never a command.
 *
 * ── The security property that matters ───────────────────────────────────────
 * Every value this file can return is an `id` **copied out of the catalog it
 * was given**. There is no path by which a caller's phrase becomes the answer,
 * so `bash -c id` and `spotify; rm -rf /` cannot resolve to themselves — they
 * simply match nothing. That is a structural guarantee, not a filter, and it
 * holds regardless of how hostile the phrase is.
 *
 * This is still only the *first* of two checks. The server independently
 * validates the id against its own enumeration before anything is launched;
 * nothing here is trusted on the far side of the boundary.
 *
 * ── Conservative by design ───────────────────────────────────────────────────
 * Two applications that match equally well produce `ambiguous`, never a pick.
 * Launching the wrong application is a visible, unwanted action on someone's
 * desktop, and a question costs them one word.
 */

/** One installed application, reduced to what naming needs. */
export interface CatalogApplication {
  /** The desktop entry id. The stable identity, and the only thing ever returned. */
  id: string;
  /** What the desktop entry calls itself. */
  name: string;
  /** NOVA's spatial category, when it has one. Most discovered apps are `unknown`. */
  appType?: AppType | 'unknown';
  running?: boolean;
}

export type CatalogMatch =
  | 'display-name'
  | 'desktop-id'
  | 'nova-alias'
  | 'token'
  | 'id-segment';

export type CatalogResolution =
  | { status: 'resolved'; id: string; name: string; via: CatalogMatch }
  | {
      status: 'ambiguous';
      candidates: Array<{ id: string; name: string }>;
      reason: string;
    }
  | { status: 'unresolved'; reason: string };

/** Words that describe no application in particular. */
const FILLER = new Set(['the', 'a', 'an', 'my', 'app', 'apps', 'application', 'program', 'please']);

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.desktop$/, '')
    .replace(/[^a-z0-9.+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (value: string) =>
  normalise(value)
    .split(/[\s.-]+/)
    .filter((word) => word.length > 0 && !FILLER.has(word));

/** Segments of a reverse-DNS id that identify nothing on their own. */
const GENERIC_SEGMENTS = new Set([
  'com', 'org', 'io', 'net', 'dev', 'app', 'me', 'xyz', 'eu', 'de', 'fr',
  'github', 'gitlab', 'flathub', 'desktop', 'gnome', 'kde', 'freedesktop',
]);

const unique = (entries: CatalogApplication[]) => {
  const byId = new Map<string, CatalogApplication>();
  for (const entry of entries) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()];
};

function resolvedFrom(entry: CatalogApplication, via: CatalogMatch): CatalogResolution {
  return { status: 'resolved', id: entry.id, name: entry.name, via };
}

function decide(
  matches: CatalogApplication[],
  via: CatalogMatch,
  reason: string,
): CatalogResolution | null {
  const candidates = unique(matches);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return resolvedFrom(candidates[0], via);
  return {
    status: 'ambiguous',
    candidates: candidates.map((entry) => ({ id: entry.id, name: entry.name })),
    reason,
  };
}

/**
 * Which NOVA spatial category, if any, does this phrase name?
 *
 * Category words only. A brand name must not reach this rung, or "chrome" would
 * be read as "some browser" and match every installed browser at once —
 * reporting ambiguity for a question that had a precise answer.
 */
function novaAliasFor(phrase: string): AppType | null {
  return genericAppFor(phrase);
}

/**
 * Resolve a phrase to an installed application.
 *
 * Pure: the catalog is supplied rather than read, so the whole matching ladder
 * can be tested against fixtures — including catalogs with duplicate display
 * names, which is the case the conservatism exists for.
 *
 * The ladder runs most-exact first and stops at the first rung that matches
 * anything at all. A rung that matches several applications reports ambiguity
 * rather than falling through to a vaguer rung, because a vaguer rung agreeing
 * on one of them would not make the user's intent any clearer.
 */
export function resolveApplication(
  phrase: string,
  catalog: CatalogApplication[],
): CatalogResolution {
  const text = normalise(phrase);
  if (!text) return { status: 'unresolved', reason: 'No application was named.' };
  if (!catalog.length) {
    return { status: 'unresolved', reason: 'No installed applications are known.' };
  }

  // 1. The application's own name, exactly.
  const byName = catalog.filter((entry) => normalise(entry.name) === text);
  const nameDecision = decide(byName, 'display-name', `Several applications are called "${phrase.trim()}".`);
  if (nameDecision) return nameDecision;

  // 2. The desktop id itself, exactly. Lets an id round-trip through NOVA.
  const byId = catalog.filter((entry) => normalise(entry.id) === text);
  const idDecision = decide(byId, 'desktop-id', 'Several entries share that id.');
  if (idDecision) return idDecision;

  // 3. A NOVA alias — "the editor", "web", "shell". Backward compatibility with
  //    the five spatial applications, whose aliases users already know.
  const alias = novaAliasFor(text);
  if (alias) {
    const byAlias = catalog.filter((entry) => entry.appType === alias);
    const aliasDecision = decide(
      byAlias,
      'nova-alias',
      `Several applications could be "${phrase.trim()}".`,
    );
    if (aliasDecision) return aliasDecision;
  }

  // 4. Every word the user said is the start of a word in the name.
  //    "text editor" → "Text Editor"; "libre writer" → "LibreOffice Writer".
  const queryWords = words(text);
  if (queryWords.length) {
    const byToken = catalog.filter((entry) => {
      const nameWords = words(entry.name);
      return queryWords.every((word) => nameWords.some((candidate) => candidate.startsWith(word)));
    });
    const tokenDecision = decide(
      byToken,
      'token',
      `"${phrase.trim()}" matches more than one installed application.`,
    );
    if (tokenDecision) return tokenDecision;
  }

  // 5. A meaningful segment of a reverse-DNS id — how "brave" finds
  //    `com.brave.Browser` when the entry calls itself something else.
  if (queryWords.length === 1) {
    const [word] = queryWords;
    if (word.length >= 3 && !GENERIC_SEGMENTS.has(word)) {
      const bySegment = catalog.filter((entry) =>
        normalise(entry.id)
          .split('.')
          .some((segment) => segment === word && !GENERIC_SEGMENTS.has(segment)),
      );
      const segmentDecision = decide(
        bySegment,
        'id-segment',
        `"${phrase.trim()}" matches more than one installed application.`,
      );
      if (segmentDecision) return segmentDecision;
    }
  }

  return { status: 'unresolved', reason: `No installed application matches "${phrase.trim()}".` };
}

/**
 * The catalog NOVA currently knows about.
 *
 * A plain read of the last Phase 8 snapshot — no I/O, and safe to call from
 * anywhere outside a render path. Returns an empty catalog when no provider has
 * answered, which the resolver reports as unresolved rather than as a failure.
 */
export function installedApplications(): CatalogApplication[] {
  const snapshot = nativeState().snapshot;
  if (snapshot.status !== 'ok') return [];
  return snapshot.applications.map((application) => ({
    id: application.nativeId,
    name: application.name,
    appType: application.appType,
    running: application.running,
  }));
}
