import { useSpatialStore } from '../../state/spatialStore';
import { WORKSPACES, WORKSPACE_ORDER } from '../../data/workspaces';
import { dispatch } from '../../systems/command/commandBus';

/**
 * Context, not navigation.
 *
 * Three named arrangements of the same space. Choosing one re-places every object
 * in the environment, which is the whole point: NOVA is meant to lay the space out
 * for what you are doing rather than ask you to arrange it yourself.
 */
export function WorkspaceRail() {
  const active = useSpatialStore((state) => state.workspace);

  return (
    <nav className="rail" aria-label="Workspaces">
      {WORKSPACE_ORDER.map((id, index) => (
        <button
          key={id}
          type="button"
          className={`rail__item${id === active ? ' is-active' : ''}`}
          onClick={() => dispatch({ action: 'workspace', target: id }, 'pointer')}
        >
          <span className="rail__index">{String(index + 1).padStart(2, '0')}</span>
          <span className="rail__name">{WORKSPACES[id].name}</span>
        </button>
      ))}
    </nav>
  );
}
