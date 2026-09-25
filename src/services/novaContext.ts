import type {
  NovaSpatialContext,
  NovaWindowState,
  NovaWorkspaceId,
  NovaCommandResponse,
  SpatialRelation,
} from '../types/nova';

export const INITIAL_WINDOWS: NovaWindowState[] = [
  {
    id: 'code',
    name: 'Code',
    visible: true,
    position: 'center-left',
    coordinates: { x: -2.2, y: 0.2, z: -0.5 },
    scale: 1.0,
    focused: true,
    workspace: 'development',
    zOrder: 3,
  },
  {
    id: 'browser',
    name: 'Browser',
    visible: true,
    position: 'center-right',
    coordinates: { x: 2.2, y: 0.2, z: -0.5 },
    scale: 1.0,
    focused: false,
    workspace: 'development',
    zOrder: 2,
  },
  {
    id: 'terminal',
    name: 'Terminal',
    visible: true,
    position: 'bottom-center',
    coordinates: { x: 0, y: -1.6, z: -0.2 },
    scale: 0.9,
    focused: false,
    workspace: 'development',
    zOrder: 1,
  },
  {
    id: 'notes',
    name: 'Notes',
    visible: true,
    position: 'left',
    coordinates: { x: -3.0, y: 0.0, z: -1.0 },
    scale: 1.0,
    focused: false,
    workspace: 'study',
    zOrder: 1,
  },
  {
    id: 'files',
    name: 'Files',
    visible: true,
    position: 'right',
    coordinates: { x: 3.0, y: 0.0, z: -1.0 },
    scale: 0.95,
    focused: false,
    workspace: 'home',
    zOrder: 1,
  },
  {
    id: 'nova_core',
    name: 'NOVA Core',
    visible: true,
    position: 'center',
    coordinates: { x: 0, y: 1.8, z: -2.0 },
    scale: 0.8,
    focused: false,
    workspace: 'development',
    zOrder: 0,
  },
];

export const WORKSPACES: Array<{ id: NovaWorkspaceId; name: string; description: string }> = [
  { id: 'development', name: 'Development', description: 'Code editor, browser preview, and command terminal' },
  { id: 'study', name: 'Study', description: 'Documentation, reference notes, and reading layout' },
  { id: 'home', name: 'Home', description: 'Default spatial canvas with files overview and quick launcher' },
];

/**
 * Extracts the exact clean context schema expected by Gemini (Section 12 & 29)
 */
export function buildGeminiContext(
  currentWorkspace: NovaWorkspaceId,
  windows: NovaWindowState[]
): NovaSpatialContext {
  const focused = windows.find((w) => w.focused && w.workspace === currentWorkspace);
  const activeWorkspaceInfo = WORKSPACES.find((ws) => ws.id === currentWorkspace);

  return {
    workspace: currentWorkspace,
    workspaceName: activeWorkspaceInfo ? activeWorkspaceInfo.name : currentWorkspace,
    focusedWindow: focused ? focused.id : null,
    windows: windows
      .filter((w) => w.workspace === currentWorkspace || w.id === 'nova_core')
      .map((w) => ({
        id: w.id,
        name: w.name,
        visible: w.visible,
        position: w.position,
        scale: Number(w.scale.toFixed(2)),
        focused: w.focused,
        zOrder: w.zOrder,
      })),
    availableWorkspaces: WORKSPACES,
  };
}

/**
 * Semantic position helper to translate relations into 3D spatial deltas
 * (Enforcing that NOVA decides coordinates, NOT Gemini)
 */
function applySpatialRelation(
  relation: SpatialRelation,
  currentCoords: { x: number; y: number; z: number }
): { coords: { x: number; y: number; z: number }; positionLabel: string } {
  switch (relation) {
    case 'left':
      return { coords: { x: -2.8, y: currentCoords.y, z: currentCoords.z }, positionLabel: 'left' };
    case 'right':
      return { coords: { x: 2.8, y: currentCoords.y, z: currentCoords.z }, positionLabel: 'right' };
    case 'above':
      return { coords: { x: currentCoords.x, y: 1.8, z: currentCoords.z }, positionLabel: 'above' };
    case 'below':
      return { coords: { x: currentCoords.x, y: -1.8, z: currentCoords.z }, positionLabel: 'below' };
    case 'center':
      return { coords: { x: 0, y: 0, z: currentCoords.z }, positionLabel: 'center' };
    case 'front':
    case 'near':
      return { coords: { x: currentCoords.x, y: currentCoords.y, z: -0.2 }, positionLabel: 'near-front' };
    case 'behind':
    case 'far':
      return { coords: { x: currentCoords.x, y: currentCoords.y, z: -1.8 }, positionLabel: 'far-behind' };
    case 'beside':
    case 'next_to':
      return { coords: { x: currentCoords.x + 1.6, y: currentCoords.y, z: currentCoords.z }, positionLabel: 'beside' };
    default:
      return { coords: currentCoords, positionLabel: relation };
  }
}

/**
 * NOVA Command Bus execution engine
 * Executes structured commands produced by Gemini without direct Three.js mutation
 */
export function executeNovaCommands(
  commandResponse: NovaCommandResponse,
  currentWorkspace: NovaWorkspaceId,
  currentWindows: NovaWindowState[]
): {
  updatedWorkspace: NovaWorkspaceId;
  updatedWindows: NovaWindowState[];
  executionLog: string[];
} {
  let workspace = currentWorkspace;
  let windows = currentWindows.map((w) => ({ ...w, coordinates: { ...w.coordinates } }));
  const executionLog: string[] = [];

  if (commandResponse.status !== 'ok' || !commandResponse.commands?.length) {
    return { updatedWorkspace: workspace, updatedWindows: windows, executionLog };
  }

  for (const cmd of commandResponse.commands) {
    const { action, target, parameters } = cmd;

    // Resolve target window (handle contextual pronouns like 'focused_window', 'current_window')
    let targetWindowId: string = target;
    if (target === 'focused_window' || target === 'current_window' || target === 'this' || target === 'it') {
      const activeFocused = windows.find((w) => w.focused && w.workspace === workspace);
      if (activeFocused) {
        targetWindowId = activeFocused.id;
      }
    }

    switch (action) {
      case 'SWITCH_WORKSPACE': {
        const wsTarget = (target || '').toLowerCase();
        const matchedWs = WORKSPACES.find(
          (ws) => ws.id.toLowerCase() === wsTarget || ws.name.toLowerCase() === wsTarget
        );
        if (matchedWs) {
          workspace = matchedWs.id;
          executionLog.push(`Switched active workspace to "${matchedWs.name}" (${matchedWs.id})`);
        } else {
          executionLog.push(`Workspace "${target}" not recognized; unchanged.`);
        }
        break;
      }

      case 'FOCUS': {
        windows = windows.map((w) => {
          const isTarget = w.id === targetWindowId || w.name.toLowerCase() === targetWindowId.toLowerCase();
          return {
            ...w,
            focused: isTarget,
            zOrder: isTarget ? Math.max(...windows.map((x) => x.zOrder)) + 1 : w.zOrder,
          };
        });
        executionLog.push(`Set focus to window "${targetWindowId}"`);
        break;
      }

      case 'MOVE': {
        const relation = (parameters?.relation as SpatialRelation) || 'center';
        windows = windows.map((w) => {
          if (w.id === targetWindowId || w.name.toLowerCase() === targetWindowId.toLowerCase()) {
            const { coords, positionLabel } = applySpatialRelation(relation, w.coordinates);
            return {
              ...w,
              coordinates: coords,
              position: positionLabel,
            };
          }
          return w;
        });
        executionLog.push(`Moved "${targetWindowId}" to spatial relation: ${relation}`);
        break;
      }

      case 'RESIZE': {
        let newScale: number | undefined = parameters?.scale;
        const multiplier = parameters?.scaleMultiplier;

        windows = windows.map((w) => {
          if (w.id === targetWindowId || w.name.toLowerCase() === targetWindowId.toLowerCase()) {
            let s = w.scale;
            if (newScale !== undefined) {
              s = newScale;
            } else if (multiplier !== undefined) {
              s = w.scale * multiplier;
            }
            // Clamp within NOVA limits: [0.5, 2.0]
            s = Math.min(Math.max(s, 0.5), 2.0);
            return { ...w, scale: Number(s.toFixed(2)) };
          }
          return w;
        });
        executionLog.push(`Resized "${targetWindowId}" (scale: ${newScale ?? multiplier})`);
        break;
      }

      case 'BRING_FORWARD': {
        const maxZ = Math.max(...windows.map((w) => w.zOrder));
        windows = windows.map((w) => {
          if (w.id === targetWindowId || w.name.toLowerCase() === targetWindowId.toLowerCase()) {
            return {
              ...w,
              focused: true,
              zOrder: maxZ + 1,
              coordinates: { ...w.coordinates, z: Math.min(w.coordinates.z + 0.3, 0) },
            };
          }
          return { ...w, focused: false };
        });
        executionLog.push(`Brought "${targetWindowId}" forward in z-order`);
        break;
      }

      case 'SEND_BACK': {
        const minZ = Math.min(...windows.map((w) => w.zOrder));
        windows = windows.map((w) => {
          if (w.id === targetWindowId || w.name.toLowerCase() === targetWindowId.toLowerCase()) {
            return {
              ...w,
              focused: false,
              zOrder: Math.max(minZ - 1, 0),
              coordinates: { ...w.coordinates, z: Math.max(w.coordinates.z - 0.4, -2.5) },
            };
          }
          return w;
        });
        executionLog.push(`Sent "${targetWindowId}" back in z-order`);
        break;
      }

      case 'SHOW':
      case 'OPEN': {
        windows = windows.map((w) => {
          if (w.id === targetWindowId || w.name.toLowerCase() === targetWindowId.toLowerCase()) {
            return { ...w, visible: true, focused: true };
          }
          return w;
        });
        executionLog.push(`Opened/showed window "${targetWindowId}"`);
        break;
      }

      case 'HIDE':
      case 'CLOSE': {
        windows = windows.map((w) => {
          if (w.id === targetWindowId || w.name.toLowerCase() === targetWindowId.toLowerCase()) {
            return { ...w, visible: false, focused: false };
          }
          return w;
        });
        executionLog.push(`Closed/hid window "${targetWindowId}"`);
        break;
      }

      case 'ARRANGE': {
        const layout = parameters?.layout || 'side_by_side';
        const activeWins = windows.filter((w) => w.workspace === workspace && w.visible && w.id !== 'nova_core');
        const count = activeWins.length;
        windows = windows.map((w) => {
          const idx = activeWins.findIndex((aw) => aw.id === w.id);
          if (idx !== -1) {
            const spacing = 4.0 / Math.max(count - 1, 1);
            const posX = -2.0 + idx * spacing;
            return {
              ...w,
              coordinates: { x: posX, y: 0, z: -0.5 },
              position: idx === 0 ? 'left' : idx === count - 1 ? 'right' : 'center',
            };
          }
          return w;
        });
        executionLog.push(`Arranged active windows in ${layout} layout`);
        break;
      }

      default: {
        executionLog.push(`Action "${action}" processed on target "${target}"`);
        break;
      }
    }
  }

  return { updatedWorkspace: workspace, updatedWindows: windows, executionLog };
}
