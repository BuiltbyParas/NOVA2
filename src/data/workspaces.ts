import type { Workspace, WorkspaceId } from '../types/workspace';
import { position, rotation } from '../types/spatial';

/**
 * Workspace layouts.
 *
 * Every coordinate here is deliberate. Two rules govern the arrangements:
 *
 *  1. Dominant work sits near the centre at a shallow depth; supporting tools sit
 *     wider, deeper and turned slightly inward so the space reads as a workstation
 *     rather than a scatter of floating panels.
 *  2. The screen region around the NOVA Core is kept clear in every arrangement.
 *     The Core is the system's anchor and must never be buried behind a window.
 */
const home: Workspace = {
  id: 'home',
  name: 'Home',
  intent: 'Everything within reach',
  core: position(0, -1.25, 1.1),
  placements: {
    code: { position: position(0, 0.62, -0.35), rotation: rotation(0, 0, 0), scale: 1 },
    browser: {
      position: position(-3.02, 0.45, -1.45),
      rotation: rotation(0.02, 0.3, 0),
      scale: 0.86,
    },
    terminal: {
      position: position(3.02, 0.4, -1.5),
      rotation: rotation(0.02, -0.3, 0),
      scale: 0.86,
    },
    files: {
      position: position(-2.3, -1.0, 0.5),
      rotation: rotation(-0.03, 0.22, 0),
      scale: 0.74,
    },
    notes: {
      position: position(2.3, -1.0, 0.5),
      rotation: rotation(-0.03, -0.22, 0),
      scale: 0.74,
    },
  },
};

const development: Workspace = {
  id: 'development',
  name: 'Development',
  intent: 'Code forward, terminal and browser in support',
  core: position(0, -1.35, 1.3),
  placements: {
    code: { position: position(0, 0.55, 0.65), rotation: rotation(0, 0, 0), scale: 1.26 },
    terminal: {
      position: position(2.88, -0.4, -0.85),
      rotation: rotation(0.04, -0.34, 0),
      scale: 0.88,
    },
    browser: {
      position: position(-2.92, 0.4, -1.0),
      rotation: rotation(0.02, 0.32, 0),
      scale: 0.86,
    },
    files: {
      position: position(-2.6, -1.6, -2.5),
      rotation: rotation(0, 0.3, 0),
      scale: 0.58,
    },
    notes: {
      position: position(2.7, -1.65, -2.6),
      rotation: rotation(0, -0.3, 0),
      scale: 0.55,
    },
  },
};

const study: Workspace = {
  id: 'study',
  name: 'Study',
  intent: 'Reading and writing side by side',
  core: position(0, -1.3, 1.2),
  placements: {
    notes: {
      position: position(-1.72, 0.5, 0.7),
      rotation: rotation(0, 0.14, 0),
      scale: 1.12,
    },
    browser: {
      position: position(1.72, 0.55, 0.5),
      rotation: rotation(0, -0.14, 0),
      scale: 1.06,
    },
    files: {
      position: position(-3.4, -1.25, -2.0),
      rotation: rotation(0, 0.36, 0),
      scale: 0.56,
    },
    code: {
      position: position(3.4, -1.3, -2.1),
      rotation: rotation(0, -0.36, 0),
      scale: 0.52,
    },
    terminal: {
      position: position(-3.5, 1.15, -2.4),
      rotation: rotation(0, 0.36, 0),
      scale: 0.46,
    },
  },
};

export const WORKSPACES: Record<WorkspaceId, Workspace> = { home, development, study };

export const WORKSPACE_ORDER: WorkspaceId[] = ['home', 'development', 'study'];

/** The app that becomes dominant when a workspace is entered, if any. */
export const WORKSPACE_FOCUS: Record<WorkspaceId, string | null> = {
  home: null,
  development: 'code',
  study: 'notes',
};
