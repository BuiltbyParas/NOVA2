import { useSpatialStore } from '../../state/spatialStore';
import { dispatch } from '../../systems/command/commandBus';

/**
 * Spatial Layer Indicator.
 *
 * Designed as architectural telemetry rather than a web tab/taskbar.
 * Displays subtle spatial pips corresponding to available application layers,
 * with current active layer highlighted and interactive.
 */
export function LayerIndicator() {
  const currentLayerIndex = useSpatialStore((state) => state.layer.currentLayerIndex);
  const targetLayerIndex = useSpatialStore((state) => state.layer.targetLayerIndex);
  const phase = useSpatialStore((state) => state.layer.phase);
  const layers = useSpatialStore((state) => state.layer.layers);
  const presenting = useSpatialStore((state) => state.presentation);

  if (presenting || !layers || layers.length <= 1) return null;

  return (
    <aside className="nova-layer-indicator" aria-label="Spatial Application Layers">
      <div className="nova-layer-indicator__track">
        {layers.map((layer, index) => {
          const isActive = index === currentLayerIndex;
          const isTarget = index === targetLayerIndex && phase === 'transitioning';

          return (
            <button
              key={layer.id}
              type="button"
              className={`nova-layer-indicator__pip ${isActive ? 'is-active' : ''} ${isTarget ? 'is-transitioning' : ''}`}
              onClick={() => dispatch({ action: 'layer-go', target: index }, 'pointer')}
              title={`Spatial Layer ${index + 1}: ${layer.name}`}
            >
              <span className="nova-layer-indicator__dot" />
              <span className="nova-layer-indicator__label">
                <span className="nova-layer-indicator__index">0{index + 1}</span>
                <span className="nova-layer-indicator__name">{layer.name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
