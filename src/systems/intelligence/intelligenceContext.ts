import type { NovaContextGraph } from '../../types/context';
import { APP_ORDER, APPS } from '../../data/apps';
import { LIMITS, type IntelligenceContext } from './protocol';

/**
 * What the conversation is told about NOVA.
 *
 * A projection, written out field by field, rather than a copy of anything.
 * The context graph already knows window positions, relations, tasks, pointer
 * referents and the host's process list; the model needs almost none of that to
 * hold a conversation or to phrase an instruction, so almost none of it leaves.
 *
 * Pure: the same graph and the same recent actions always produce the same
 * context, which is what lets a test pin exactly what is sent.
 */
export function projectIntelligenceContext(
  graph: NovaContextGraph,
  recentActions: readonly string[] = [],
): IntelligenceContext {
  const native = graph.native;
  const nativeAvailable = native.status === 'ok';

  const byName = (a: string, b: string) => a.localeCompare(b);
  const installed = nativeAvailable
    ? [...new Set(native.applications.map((application) => application.name))].sort(byName)
    : [];
  const running = nativeAvailable
    ? [...new Set(native.applications.filter((a) => a.running).map((a) => a.name))].sort(byName)
    : [];

  return {
    workspace: graph.workspace.name,
    focusedWindow: graph.focusedId,
    openWindows: graph.windows.filter((win) => !win.minimized).map((win) => win.id),
    spatialApplications: APP_ORDER.map((app) => APPS[app].name.toLowerCase()),
    installedApplications: installed.slice(0, LIMITS.contextListEntries),
    runningApplications: running.slice(0, 20),
    recentActions: recentActions.slice(-5),
    nativeAvailable,
  };
}
