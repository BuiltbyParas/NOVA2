import type { AppType } from '../types/window';
import type { WorkspaceId } from '../types/workspace';
import type { SemanticRole, TaskId } from '../types/context';

/**
 * Tasks, and what each application means inside one.
 *
 * This is configuration in the same sense `apps.ts` and `workspaces.ts` are —
 * a small declarative table, not a task manager. NOVA needs to know that a
 * browser open next to an editor is *documentation beside implementation*;
 * it does not need due dates, progress or ownership, and adding them would turn
 * a context model into a project-management application.
 */

/**
 * The role an application plays in work. Fixed per app for now because our five
 * applications have one honest role each. When a window can hold arbitrary
 * content, this becomes a per-window property and nothing else has to change.
 */
export const APP_ROLES: Record<AppType, SemanticRole> = {
  browser: 'documentation',
  code: 'implementation',
  terminal: 'execution',
  notes: 'reference',
  files: 'storage',
};

export interface TaskDefinition {
  id: TaskId;
  name: string;
  /** The words a person actually uses: "my database work", "the NOVA build". */
  aliases: string[];
  /** Applications that serve this task, most central first. */
  apps: AppType[];
  /** The workspace this task is normally carried out in. */
  workspace: WorkspaceId;
}

const novaBuild: TaskDefinition = {
  id: 'nova-build',
  name: 'NOVA Build',
  aliases: ['nova', 'sih', 'spatial shell', 'the build', 'this project'],
  apps: ['code', 'terminal', 'browser', 'notes'],
  workspace: 'development',
};

const databaseAssignment: TaskDefinition = {
  id: 'database-assignment',
  name: 'Database Assignment',
  aliases: ['database', 'db', 'sql', 'assignment', 'database work', 'coursework'],
  apps: ['notes', 'browser', 'code', 'terminal', 'files'],
  workspace: 'study',
};

const workbench: TaskDefinition = {
  id: 'workbench',
  name: 'Workbench',
  aliases: ['everything', 'general', 'home'],
  apps: ['code', 'browser', 'terminal', 'files', 'notes'],
  workspace: 'home',
};

export const TASKS: Record<TaskId, TaskDefinition> = {
  'nova-build': novaBuild,
  'database-assignment': databaseAssignment,
  workbench,
};

export const TASK_ORDER: TaskId[] = ['workbench', 'nova-build', 'database-assignment'];

/**
 * The task a workspace is understood to be serving when it is entered.
 *
 * A workspace is an arrangement; a task is what the arrangement is *for*. They
 * are one-to-one today, which is why this is a lookup rather than inference —
 * guessing a task from window positions would be a fiction the user never asked
 * for. Phase 5 can let this be set and remembered per session instead.
 */
export const WORKSPACE_TASK: Record<WorkspaceId, TaskId> = {
  home: 'workbench',
  development: 'nova-build',
  study: 'database-assignment',
};

/** Find a task by anything a person might call it. Longest alias wins. */
export function findTaskByPhrase(phrase: string): TaskDefinition | null {
  const text = phrase.trim().toLowerCase();
  if (!text) return null;

  let best: { task: TaskDefinition; length: number } | null = null;
  for (const id of TASK_ORDER) {
    const task = TASKS[id];
    const terms = [task.id, task.name.toLowerCase(), ...task.aliases];
    for (const term of terms) {
      if (!text.includes(term)) continue;
      if (!best || term.length > best.length) best = { task, length: term.length };
    }
  }
  return best?.task ?? null;
}
