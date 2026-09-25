import type { AppType, WindowPlacement } from './window';
import type { SpatialPosition } from './spatial';

export type WorkspaceId = 'home' | 'development' | 'study';

/**
 * A workspace is an *intentional spatial arrangement*, not a list of icons.
 * Switching workspace re-places every object, including the NOVA Core itself.
 */
export interface Workspace {
  id: WorkspaceId;
  name: string;
  /** Shown while the environment re-arranges, so the transition explains itself. */
  intent: string;
  core: SpatialPosition;
  placements: Record<AppType, WindowPlacement>;
  /** Apps that collapse to the spatial dock in this arrangement. */
  minimized?: AppType[];
}
