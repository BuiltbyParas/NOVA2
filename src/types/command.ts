import type { SpatialPosition, SpatialRotation } from './spatial';
import type { AppType } from './window';
import type { WorkspaceId } from './workspace';

/**
 * A structured intent. This is the ONLY vocabulary that can change NOVA's state.
 *
 * Pointer, keyboard, the command line — and later gesture, voice and Gemini —
 * all produce values of this type. Nothing upstream of the command bus is ever
 * allowed to touch a Three.js object or a React ref directly.
 */

/**
 * What a command acts on: an app name (how language refers to a window), a
 * concrete window id, or a keyword resolved at dispatch time. The `string`
 * member keeps ids valid while preserving completion for the named cases.
 */
export type CommandTarget = AppType | 'focused' | 'all' | (string & {});

/** Relations let intent be expressed spatially rather than numerically. */
export type SpatialRelation =
  | 'left_of'
  | 'right_of'
  | 'above'
  | 'below'
  | 'in_front_of'
  | 'behind';

export type CoreState = 'idle' | 'listening' | 'working';

export type NovaCommand =
  | { action: 'focus'; target: CommandTarget }
  | { action: 'blur' }
  /** Open one of NOVA's five spatial applications. Creates or restores a window. */
  | {
      action: 'open';
      target: AppType;
      /**
       * Revealed by the NOVA portal (Phase 12): the window comes out of the Core
       * after `delayMs` (so a bloom is staggered), without focusing itself and
       * without moving NOVA to the application's layer — a bloom reveals every
       * application, and Phase 13 seats those of other layers behind.
       */
      reveal?: { delayMs: number };
    }
  /**
   * Launch an installed application NOVA has discovered but has no surface for.
   *
   * Separate from `open` because `open` is bound to a spatial window: it needs
   * an `AppType`, an `APPS` definition and a placement in every workspace, none
   * of which a discovered application has. Conflating them would mean either
   * widening `AppType` or creating a window with no position. This command
   * launches and does nothing spatial, which is exactly what it means.
   */
  | { action: 'open-application'; applicationId: string; name?: string }
  | { action: 'close'; target: CommandTarget }
  | { action: 'minimize'; target: CommandTarget }
  | { action: 'restore'; target: CommandTarget }
  | {
      action: 'move';
      target: CommandTarget;
      position?: Partial<SpatialPosition>;
      delta?: Partial<SpatialPosition>;
      relation?: SpatialRelation;
      reference?: CommandTarget;
    }
  | { action: 'scale'; target: CommandTarget; scale?: number; delta?: number }
  | {
      action: 'rotate';
      target: CommandTarget;
      rotation?: Partial<SpatialRotation>;
      delta?: Partial<SpatialRotation>;
    }
  | { action: 'workspace'; target: WorkspaceId }
  /** Declare what the current arrangement is for. Context, not navigation. */
  | { action: 'task'; target: string | null }
  | { action: 'arrange' }
  | { action: 'core'; state: CoreState }
  /** Open or close the line where the user speaks to NOVA in words. */
  | { action: 'command'; open: boolean }
  /**
   * Open or close the NOVA application portal (Phase 12). Explicit, never a
   * toggle, so a repeated activation is harmless.
   */
  | { action: 'portal'; open: boolean }
  /** Turn webcam vision mode on or off. */
  | { action: 'vision'; active?: boolean }
  /**
   * Operate the microphone. Voice reaches state only as the ordinary commands a
   * recognised sentence resolves to — this one starts and stops the device.
   */
  | { action: 'voice-input'; mode: 'start' | 'stop' | 'cancel' }
  /** Toggle or set the vision developer debug overlay. */
  | { action: 'vision-debug'; open?: boolean }
  /** Toggle or set the developer context inspector. */
  | { action: 'context-debug'; open?: boolean }
  /**
   * Spatial memory. Four actions, no more: a memory is taken, brought back or
   * discarded. Listing is a query and only opens the inspector.
   */
  | { action: 'memory-save'; name: string }
  | { action: 'memory-restore'; id: string }
  | { action: 'memory-delete'; id: string }
  | { action: 'memory-list'; open?: boolean }
  /** Navigate spatial application layers */
  | { action: 'layer'; direction: 'next' | 'previous' }
  | { action: 'layer-go'; target: number | string };

/**
 * Where a command came from. Kept on the envelope so the Core can react
 * differently to "the user pointed at it" vs "the system decided".
 */
export type CommandSource =
  | 'pointer'
  | 'keyboard'
  | 'command-line'
  | 'system'
  | 'gesture' // reserved: hand tracking
  | 'voice' // reserved: speech
  | 'ai'; // reserved: Gemini-produced intent

export interface CommandEnvelope {
  command: NovaCommand;
  source: CommandSource;
  at: number;
}
