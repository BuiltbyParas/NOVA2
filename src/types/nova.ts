export type NovaAction =
  | 'OPEN'
  | 'CLOSE'
  | 'SHOW'
  | 'HIDE'
  | 'FOCUS'
  | 'MOVE'
  | 'RESIZE'
  | 'ROTATE'
  | 'BRING_FORWARD'
  | 'SEND_BACK'
  | 'ARRANGE'
  | 'SWITCH_WORKSPACE'
  /** Spatial memory (Phase 5). The model names the memory; NOVA finds it. */
  | 'SAVE_MEMORY'
  | 'RESTORE_MEMORY'
  | 'LIST_MEMORIES'
  | 'DELETE_MEMORY';

export type SpatialRelation =
  | 'left'
  | 'right'
  | 'above'
  | 'below'
  | 'front'
  | 'behind'
  | 'center'
  | 'near'
  | 'far'
  | 'beside'
  | 'next_to';

export type NovaWindowId =
  | 'browser'
  | 'code'
  | 'terminal'
  | 'files'
  | 'notes'
  | 'nova_core';

export type NovaWorkspaceId = 'development' | 'study' | 'home';

export type NovaTarget =
  | NovaWindowId
  | NovaWorkspaceId
  | 'current_window'
  | 'focused_window'
  | 'current_workspace'
  | string;

export interface CommandParameters {
  relation?: SpatialRelation;
  relativeTo?: NovaTarget;
  scale?: number;
  scaleMultiplier?: number;
  angle?: number;
  axis?: 'x' | 'y' | 'z';
  layout?: 'grid' | 'cascade' | 'focus_center' | 'side_by_side';
  /** What to call a memory being saved, or which one is being referred to. */
  name?: string;
  [key: string]: unknown;
}

export interface NovaCommand {
  action: NovaAction;
  target: NovaTarget;
  parameters?: CommandParameters;
}

export type NovaResponseStatus =
  | 'ok'
  | 'needs_clarification'
  | 'unsupported'
  | 'invalid';

export interface NovaCommandResponse {
  status: NovaResponseStatus;
  confidence?: number;
  intentSummary?: string;
  commands: NovaCommand[];
  message?: string;
}

export interface SpatialCoordinates {
  x: number;
  y: number;
  z: number;
}

export interface NovaWindowState {
  id: NovaWindowId;
  name: string;
  visible: boolean;
  position: string; // semantic position, e.g. "center-left", "center-right"
  coordinates: SpatialCoordinates;
  scale: number;
  focused: boolean;
  workspace: NovaWorkspaceId;
  zOrder: number;
  rotation?: { x: number; y: number; z: number };
}

export interface NovaSpatialContext {
  workspace: NovaWorkspaceId;
  workspaceName: string;
  focusedWindow: NovaWindowId | null;
  windows: Array<{
    id: NovaWindowId;
    name: string;
    visible: boolean;
    position: string;
    scale: number;
    focused?: boolean;
    zOrder?: number;
  }>;
  availableWorkspaces: Array<{
    id: NovaWorkspaceId;
    name: string;
    description: string;
  }>;
}

export interface TestCase {
  id: string;
  category:
    | 'Basic spatial commands'
    | 'Resize'
    | 'Focus'
    | 'Context'
    | 'Relative relationships'
    | 'Multi-command'
    | 'Workspace'
    | 'Ambiguous'
    | 'Unsupported'
    | 'Edge cases';
  prompt: string;
  contextOverride?: Partial<NovaSpatialContext>;
  expectedStatus: NovaResponseStatus;
  expectedActions?: NovaAction[];
  expectedTarget?: string;
  description: string;
}
