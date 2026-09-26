import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { Camera, Intersection, Object3D } from 'three';
import { IDLE_FRAME, type PointerFrame } from '../input/types';
import { CORE_TARGET_ID, spatialTargets, type TargetKind } from './targetRegistry';
import { inputRouter } from '../input/inputRouter';
import { notePointing } from '../multimodal/interactionContext';
import { performGestureIntent } from '../multimodal/gestureCommands';
import { MIN_HAND_CONFIDENCE } from '../multimodal/referentResolution';
import { TAP_MAX_MS, TAP_MAX_TRAVEL } from '../../vision/gestureRecognizer';
import type { CommandSource } from '../../types/command';
import type { SpatialWindow } from '../../types/window';
import { dispatch } from '../command/commandBus';
import { useSpatialStore } from '../../state/spatialStore';
import { APPS } from '../../data/apps';
import { requestPortal, togglePortal } from '../portal/portal';

export type InteractionMode = 'idle' | 'hover' | 'move' | 'scale' | 'rotate';

/** Controls that live on the window surface itself, hit-tested in 3D. */
export type SurfaceControl = 'close' | 'minimize' | 'resize' | null;

/**
 * Normalised regions of a window surface, in local surface coordinates where
 * (0,0) is the bottom-left corner and (1,1) the top-right. The DOM chrome is laid
 * out against the same numbers so what you see and what you can hit agree.
 */
export const SURFACE_REGIONS = {
  headerHeight: 0.13,
  closeFrom: 0.944,
  minimizeFrom: 0.888,
  resizeCorner: 0.14,
} as const;

/**
 * Live pointer read-out shared with the renderer.
 *
 * Deliberately a plain mutable object rather than React state: it changes every
 * frame and routing that through React would cost re-renders for no benefit.
 */
export interface CursorState {
  /** Screen position in CSS pixels. */
  x: number;
  y: number;
  visible: boolean;
  hoveredId: string | null;
  hoveredKind: TargetKind | null;
  hoveredControl: SurfaceControl;
  /** Distance from the viewpoint, used to size the cursor with depth. */
  distance: number;
  /** World depth of whatever the pointer has landed on. */
  depth: number;
  mode: InteractionMode;
  /**
   * The window a double pinch would select right now, if any.
   *
   * Only ever set for a tracked hand that is confident, present, and resting on
   * a live window — never for the mouse, whose hover already says enough.
   */
  armedId: string | null;
}

export const cursor: CursorState = {
  x: 0,
  y: 0,
  visible: false,
  hoveredId: null,
  hoveredKind: null,
  hoveredControl: null,
  distance: 7,
  depth: 0,
  mode: 'idle',
  armedId: null,
};

/**
 * How far a hand pinch travels, in NDC, before it becomes a drag.
 *
 * Twice `TAP_MAX_TRAVEL` because the recogniser measures in 0..1 image space
 * and NDC spans -1..1. Below this, and within `TAP_MAX_MS`, the recogniser may
 * still count the pinch as half of a double pinch — so the window must not move
 * yet, or selecting it would nudge it. Past either limit the pinch can no longer
 * be a tap and the drag engages at once, re-based where the hand now is so the
 * window never jumps. About 58px across a 1280px view; mouse drags have none.
 */
export const HAND_DRAG_DEAD_ZONE = TAP_MAX_TRAVEL * 2;

/** Which command source a frame's device is. Mouse is a pointer; a hand gestures. */
type InteractionSource = Extract<CommandSource, 'pointer' | 'gesture'>;

interface Grab {
  id: string;
  mode: 'move' | 'scale' | 'rotate';
  offset: Vector3;
  plane: Plane;
  startScale: number;
  startRotation: { x: number; y: number };
  startPointer: Vector2;
  startRadius: number;
  /** Which device holds the window, so every command it produces says so. */
  source: InteractionSource;
  /** False while a hand pinch is still inside its dead-zone. Mouse grabs start engaged. */
  engaged: boolean;
  startedAt: number;
  /** Where the pinch began, kept apart from `startPointer`, which engaging re-bases. */
  origin: Vector2;
  /** Whether a hand pinch has ever left the dead-zone. A pinch that has is a drag. */
  travelled: boolean;
}

function surfaceControlAt(u: number, v: number): SurfaceControl {
  if (v >= 1 - SURFACE_REGIONS.headerHeight) {
    if (u >= SURFACE_REGIONS.closeFrom) return 'close';
    if (u >= SURFACE_REGIONS.minimizeFrom) return 'minimize';
    return null;
  }
  if (u >= 1 - SURFACE_REGIONS.resizeCorner && v <= SURFACE_REGIONS.resizeCorner) return 'resize';
  return null;
}

class InteractionSystem {
  private frame: PointerFrame = { ...IDLE_FRAME, modifiers: { ...IDLE_FRAME.modifiers } };
  private previousPrimary = false;
  /**
   * Select edges are latched when they arrive rather than sampled once a frame.
   * Input arrives on its own schedule — a quick click, or later a pinch detected
   * by a tracker running at its own rate — and must never fall between frames.
   */
  private latchedPress = false;
  private latchedRelease = false;
  private latchedActivate = false;
  private pendingDepth = 0;
  /**
   * The device and confidence behind the latest frame, and behind each latched
   * edge. Read when the frame arrives, because by the time `update` runs a
   * different device may already have taken over the pointer.
   */
  private frameSource: InteractionSource = 'pointer';
  private pressSource: InteractionSource = 'pointer';
  private pressConfidence = 1;
  private activateConfidence = 1;
  /** Set while an overlay (the command deck) owns hand activation. */
  private activationClaim: (() => void) | null = null;
  /** Which surface holds the claim, so others can respect it (Phase 12). */
  private claimOwner: string | null = null;

  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private local = new Vector3();
  private projected = new Vector3();
  private scratch = new Vector3();

  private grab: Grab | null = null;

  /** Latest normalised pointer, read by the camera rig for parallax. */
  readonly pointer = new Vector2();
  pointerPresent = false;

  /** Entry point for every input source. */
  submit(frame: PointerFrame) {
    // The router hands a frame on the moment it accepts it, so the device it
    // last accepted is the device that produced this frame.
    this.frameSource = inputRouter.activeModality() === 'hand' ? 'gesture' : 'pointer';
    if (frame.primary && !this.previousPrimary) {
      this.latchedPress = true;
      this.pressSource = this.frameSource;
      this.pressConfidence = frame.confidence;
    }
    if (!frame.primary && this.previousPrimary) this.latchedRelease = true;
    /**
     * Activation is latched for the same reason a press is.
     *
     * The recogniser raises `activate` on exactly one hand frame, but hands are
     * tracked at about 30fps while `update` runs every rendered frame — so the
     * same frame is read twice and the activation would fire twice. That was
     * invisible while activation only focused a window (focusing twice changes
     * nothing); now that it opens things, it would open them twice.
     */
    if (frame.intent === 'activate') {
      this.latchedActivate = true;
      this.activateConfidence = frame.confidence;
    }
    this.previousPrimary = frame.primary;
    this.frame = frame;
    this.pointer.set(frame.x, frame.y);
    this.pointerPresent = frame.present;
    // Depth impulses are discrete, so they accumulate until the next frame reads them.
    this.pendingDepth += frame.depthDelta;
  }

  /** The window currently being manipulated, if any. */
  get activeId(): string | null {
    return this.grab?.id ?? null;
  }

  get mode(): InteractionMode {
    return this.grab?.mode ?? (cursor.hoveredId ? 'hover' : 'idle');
  }

  /**
   * Let an overlay own hand activation while it is up.
   *
   * The command deck floats over the spatial scene, but a hand's double pinch
   * still reaches the window underneath it. While a claim is held, a hand's
   * activation goes to the claimant instead, and its pinches press nothing —
   * so one double pinch is one choice, made on the deck. Mouse input is not
   * affected. `owner` names the claimant, so other surfaces (the portal) can
   * tell that the hand is in use. Returns the release.
   */
  claimActivation(onActivate: () => void, owner = 'overlay'): () => void {
    this.activationClaim = onActivate;
    this.claimOwner = owner;
    return () => {
      if (this.activationClaim === onActivate) {
        this.activationClaim = null;
        this.claimOwner = null;
      }
    };
  }

  /** Who holds a hand's activation right now, or null. Read-only. */
  activationOwner(): string | null {
    return this.activationClaim ? this.claimOwner : null;
  }

  /** Called once per rendered frame by the scene. */
  update(camera: Camera, viewport: { width: number; height: number }) {
    const pressed = this.latchedPress;
    const released = this.latchedRelease;
    const activated = this.latchedActivate;
    this.latchedPress = false;
    this.latchedRelease = false;
    this.latchedActivate = false;

    this.ndc.set(this.frame.x, this.frame.y);
    this.raycaster.setFromCamera(this.ndc, camera);

    if (this.grab) {
      cursor.armedId = null;
      if (activated && this.grab.source === 'gesture' && !this.grab.travelled) {
        // The second pinch of a double pinch pressed the window like any pinch
        // does; it never left the dead-zone, so it was a tap, not a drag. Let
        // go of it and activate — otherwise the grab it opened swallows the
        // very activation it was half of. Travel decides this, not time: an
        // activation frame that arrives late is still the end of a tap.
        this.grab = null;
        this.updateHover(camera, viewport);
        this.onActivate();
      } else if (this.frame.gesture === 'OPEN_PALM') {
        // Open-palm drop gesture: explicitly release grab
        this.grab = null;
      } else if (!(released && this.grab.source === 'gesture')) {
        // A hand's release frame is skipped: as the fingers part, the pinch
        // point springs back to the fingertip, and following it would nudge
        // the window at the moment it is let go.
        this.continueGrab(camera, viewport);
      }
    } else {
      this.updateHover(camera, viewport);
      if (activated) {
        this.onActivate();
      } else if (pressed) {
        this.onPress(camera, viewport);
        // A click that begins and ends between two frames still resolves here.
        if (this.grab) this.continueGrab(camera, viewport);
      }
    }
    if (released) this.grab = null;

    this.applyDepthImpulse();
    cursor.visible = this.frame.present;
    cursor.mode = this.mode;
  }

  private onActivate() {
    // Activation only ever comes from a hand, so it answers to the hand's floor.
    if (this.activateConfidence < MIN_HAND_CONFIDENCE) return;

    if (this.activationClaim) {
      this.activationClaim();
      return;
    }

    const id = cursor.hoveredId;
    if (!id) return;

    if (id === CORE_TARGET_ID) {
      // Phase 12: the Core is the NOVA portal. (The command line stays on ⌘K
      // and the NOVA marks.) No claim is held here — the branch above took it.
      togglePortal('gesture', null);
      return;
    }

    const win = useSpatialStore.getState().windows[id];
    if (!win) return;

    if (cursor.hoveredControl === 'close') {
      dispatch({ action: 'close', target: id }, 'gesture');
      return;
    }
    if (cursor.hoveredControl === 'minimize') {
      dispatch({ action: 'minimize', target: id }, 'gesture');
      return;
    }

    /**
     * Activating a surface is an *intention*, not a dispatch.
     *
     * It is handed to the semantic gesture layer, which resolves it against the
     * multimodal referent and expresses it as the sentence "open <window>" —
     * the same words typing or speech would produce. Nothing here decides what
     * happens next, which is why a gesture and a typed command cannot drift
     * apart.
     *
     * When the gesture says nothing — no referent, two devices disagreeing, or
     * a hand NOVA is not confident about — nothing happens at all. That is the
     * intended outcome: a blunt instrument should stay silent when unsure
     * rather than open something unasked.
     */
    performGestureIntent({
      gesture: this.frame.gesture ?? 'DOUBLE_PINCH',
      confidence: this.frame.confidence,
    });
  }

  // --- hit testing ------------------------------------------------------

  private firstHit(): Intersection<Object3D> | undefined {
    return this.raycaster.intersectObjects(spatialTargets(), false)[0];
  }

  /** Surface coordinates of a hit, in the window's own normalised space. */
  private surfaceCoords(hit: Intersection<Object3D>, width: number, height: number) {
    this.local.copy(hit.point);
    hit.object.worldToLocal(this.local);
    return { u: this.local.x / width + 0.5, v: this.local.y / height + 0.5 };
  }

  /**
   * Publish what the pointing device is aimed at.
   *
   * Called from the hover pass, but `notePointing` returns immediately unless
   * the target actually changed — so crossing a surface costs one map write,
   * and holding still costs nothing. The frame loop stays free of this.
   */
  private reportReferent(id: string | null, kind: TargetKind | null) {
    const modality = inputRouter.activeModality();
    if (!modality) return;
    // The Core is a system control, not a window a sentence can refer to.
    notePointing(modality, kind === 'window' ? id : null, this.frame.confidence);
  }

  private updateHover(camera: Camera, viewport: { width: number; height: number }) {
    const hit = this.firstHit();
    cursor.armedId = null;

    if (!hit) {
      cursor.hoveredId = null;
      cursor.hoveredKind = null;
      cursor.hoveredControl = null;
      cursor.depth = 0;
      cursor.distance = 7;
      this.reportReferent(null, null);
      this.pointerToScreen(viewport);
      return;
    }

    const id = hit.object.userData.targetId as string;
    const kind = hit.object.userData.targetKind as TargetKind;
    this.reportReferent(id, kind);
    const win = useSpatialStore.getState().windows[id];
    cursor.hoveredId = id;
    cursor.hoveredKind = kind;
    cursor.distance = hit.distance;
    cursor.depth = hit.object.getWorldPosition(this.scratch).z;

    if (win && !win.minimized) {
      const { u, v } = this.surfaceCoords(hit, win.width, win.height);
      cursor.hoveredControl = surfaceControlAt(u, v);
      if (
        this.frameSource === 'gesture' &&
        this.frame.present &&
        this.frame.confidence >= MIN_HAND_CONFIDENCE &&
        kind === 'window' &&
        win.lifecycle !== 'closing' &&
        !this.activationClaim
      ) {
        cursor.armedId = id;
      }
    } else {
      cursor.hoveredControl = null;
    }

    this.worldToScreen(hit.point, camera, viewport);
  }

  private pointerToScreen(viewport: { width: number; height: number }) {
    cursor.x = ((this.frame.x + 1) / 2) * viewport.width;
    cursor.y = ((1 - this.frame.y) / 2) * viewport.height;
  }

  private worldToScreen(
    point: Vector3,
    camera: Camera,
    viewport: { width: number; height: number },
  ) {
    this.projected.copy(point).project(camera);
    cursor.x = ((this.projected.x + 1) / 2) * viewport.width;
    cursor.y = ((1 - this.projected.y) / 2) * viewport.height;
  }

  private screenRadius(
    origin: { x: number; y: number; z: number },
    camera: Camera,
    viewport: { width: number; height: number },
  ) {
    this.projected.set(origin.x, origin.y, origin.z).project(camera);
    const centreX = ((this.projected.x + 1) / 2) * viewport.width;
    const centreY = ((1 - this.projected.y) / 2) * viewport.height;
    return Math.hypot(cursor.x - centreX, cursor.y - centreY);
  }

  // --- press ------------------------------------------------------------

  private onPress(camera: Camera, viewport: { width: number; height: number }) {
    const source = this.pressSource;
    if (source === 'gesture') {
      // A doubtful hand presses nothing — no focus, no close, not even a blur.
      if (this.pressConfidence < MIN_HAND_CONFIDENCE) return;
      // While an overlay owns the hand, the window beneath it is not pressed.
      if (this.activationClaim) return;
    }

    const id = cursor.hoveredId;
    if (!id) {
      // Pressing the empty room also folds an open portal away.
      requestPortal(false, source, this.activationOwner());
      dispatch({ action: 'blur' }, source);
      return;
    }

    if (cursor.hoveredKind === 'core') {
      // Phase 12: the Core is the NOVA portal — pressing it opens or closes it,
      // unless another surface (the Command Deck) is holding the hand.
      togglePortal(source, this.activationOwner());
      return;
    }

    const win = useSpatialStore.getState().windows[id];
    if (!win || win.lifecycle === 'closing') return;

    // A collapsed window is a target for restoring, not for manipulating.
    if (win.minimized) {
      dispatch({ action: 'restore', target: id }, source);
      dispatch({ action: 'focus', target: id }, source);
      return;
    }

    if (cursor.hoveredControl === 'close') {
      dispatch({ action: 'close', target: id }, source);
      return;
    }
    if (cursor.hoveredControl === 'minimize') {
      dispatch({ action: 'minimize', target: id }, source);
      return;
    }

    dispatch({ action: 'focus', target: id }, source);

    const mode: Grab['mode'] =
      this.frame.intent === 'scale' || cursor.hoveredControl === 'resize'
        ? 'scale'
        : this.frame.modifiers.alt
          ? 'rotate'
          : 'move';

    // Windows drag across a plane at their own depth; depth is a separate axis
    // driven by the wheel, which keeps movement predictable.
    const plane = new Plane(new Vector3(0, 0, 1), -win.position.z);
    const grabPoint = new Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, grabPoint)) return;

    this.grab = {
      id,
      mode,
      offset: grabPoint.sub(new Vector3(win.position.x, win.position.y, win.position.z)),
      plane,
      startScale: win.scale,
      startRotation: { x: win.rotation.x, y: win.rotation.y },
      startPointer: new Vector2(this.frame.x, this.frame.y),
      startRadius: Math.max(28, this.screenRadius(win.position, camera, viewport)),
      source,
      engaged: source === 'pointer',
      startedAt: performance.now(),
      origin: new Vector2(this.frame.x, this.frame.y),
      travelled: false,
    };
  }

  // --- drag -------------------------------------------------------------

  private continueGrab(camera: Camera, viewport: { width: number; height: number }) {
    const grab = this.grab;
    if (!grab) return;
    const win = useSpatialStore.getState().windows[grab.id];
    if (!win) {
      this.grab = null;
      return;
    }

    cursor.hoveredId = grab.id;

    // Transition from move to scale if pinch-and-hold resize activates
    if (grab.mode === 'move' && this.frame.intent === 'scale') {
      grab.mode = 'scale';
      grab.startScale = win.scale;
      grab.startRadius = Math.max(28, this.screenRadius(win.position, camera, viewport));
      useSpatialStore.getState().notify(`Resize Mode · ${APPS[win.app].name}`);
    }

    if (grab.source === 'gesture' && !grab.travelled) {
      const travel = Math.hypot(this.frame.x - grab.origin.x, this.frame.y - grab.origin.y);
      if (travel >= HAND_DRAG_DEAD_ZONE) grab.travelled = true;
    }
    if (!grab.engaged) {
      if (!grab.travelled && performance.now() - grab.startedAt < TAP_MAX_MS) {
        this.pointerToScreen(viewport);
        return;
      }
      this.engage(grab, win, camera, viewport);
    }

    if (grab.mode === 'move') {
      const point = new Vector3();
      if (this.raycaster.ray.intersectPlane(grab.plane, point)) {
        point.sub(grab.offset);
        dispatch(
          { action: 'move', target: grab.id, position: { x: point.x, y: point.y } },
          grab.source,
        );
        this.worldToScreen(point.add(grab.offset), camera, viewport);
      }
      return;
    }

    this.pointerToScreen(viewport);

    if (grab.mode === 'scale') {
      const radius = this.screenRadius(win.position, camera, viewport);
      dispatch(
        { action: 'scale', target: grab.id, scale: grab.startScale * (radius / grab.startRadius) },
        grab.source,
      );
      return;
    }

    const dx = this.frame.x - grab.startPointer.x;
    const dy = this.frame.y - grab.startPointer.y;
    dispatch(
      {
        action: 'rotate',
        target: grab.id,
        rotation: {
          y: grab.startRotation.y + dx * 1.1,
          x: grab.startRotation.x - dy * 0.7,
          z: 0,
        },
      },
      grab.source,
    );
  }

  /**
   * Leave the dead-zone: start the drag from where the hand is now.
   *
   * Every starting value is re-read, so the window picks up from exactly where
   * it sits instead of leaping by the distance the hand covered in the zone.
   */
  private engage(
    grab: Grab,
    win: SpatialWindow,
    camera: Camera,
    viewport: { width: number; height: number },
  ) {
    grab.engaged = true;
    const point = new Vector3();
    if (this.raycaster.ray.intersectPlane(grab.plane, point)) {
      grab.offset.copy(point.sub(new Vector3(win.position.x, win.position.y, win.position.z)));
    }
    grab.startScale = win.scale;
    grab.startRotation = { x: win.rotation.x, y: win.rotation.y };
    grab.startPointer.set(this.frame.x, this.frame.y);
    this.pointerToScreen(viewport);
    grab.startRadius = Math.max(28, this.screenRadius(win.position, camera, viewport));
  }

  // --- depth ------------------------------------------------------------

  private applyDepthImpulse() {
    if (Math.abs(this.pendingDepth) < 0.0001) return;
    const delta = this.pendingDepth;
    this.pendingDepth = 0;
    const id = this.grab?.id ?? cursor.hoveredId ?? useSpatialStore.getState().focusedId;
    if (!id) return;
    dispatch({ action: 'move', target: id, delta: { z: delta } }, 'pointer');
  }
}

export const interaction = new InteractionSystem();
