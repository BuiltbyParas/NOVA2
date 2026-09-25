import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandFrame, HandPoint, VisionConfig } from './visionTypes';
import { GestureRecognizer } from './gestureRecognizer';

export type VisionStatus = 'idle' | 'starting' | 'running' | 'error';
export type FrameCallback = (frame: HandFrame | null, video: HTMLVideoElement) => void;

class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private recognizer = new GestureRecognizer();
  private callbacks = new Set<FrameCallback>();

  private status: VisionStatus = 'idle';
  private errorMessage: string | null = null;
  private animationHandle: number | null = null;
  private vfcHandle: number | null = null;
  private lastTimestamp = -1;

  // FPS calculation for debug
  private frameCount = 0;
  private lastFpsCalc = 0;
  private currentFps = 0;

  getStatus(): VisionStatus {
    return this.status;
  }

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  getFps(): number {
    return this.currentFps;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  getRecognizer(): GestureRecognizer {
    return this.recognizer;
  }

  updateConfig(config: Partial<VisionConfig>) {
    this.recognizer.updateConfig(config);
  }

  onFrame(callback: FrameCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  async start(): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') return;

    this.status = 'starting';
    this.errorMessage = null;

    try {
      // 1. Initialize MediaPipe HandLandmarker if not already created
      if (!this.landmarker) {
        let visionWasm;
        try {
          visionWasm = await FilesetResolver.forVisionTasks('/wasm');
        } catch {
          // Fallback to official CDN if local wasm routing encounters issues
          visionWasm = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm',
          );
        }

        this.landmarker = await HandLandmarker.createFromOptions(visionWasm, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
      }

      // 2. Request webcam with sensible laptop resolution (640x480)
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam is not supported in this browser.');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user',
        },
        audio: false,
      });

      // 3. Create or attach hidden video element
      if (!this.video) {
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', '');
        this.video.muted = true;
        this.video.style.display = 'none';
        document.body.appendChild(this.video);
      }

      this.video.srcObject = this.stream;
      await this.video.play();

      this.recognizer.reset();
      this.status = 'running';
      this.lastFpsCalc = performance.now();
      this.frameCount = 0;

      // 4. Start inference loop
      this.scheduleNextFrame();
    } catch (err) {
      this.stop();
      this.status = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'Failed to initialize vision.';
      throw err;
    }
  }

  stop() {
    this.status = 'idle';

    if (this.animationHandle !== null) {
      cancelAnimationFrame(this.animationHandle);
      this.animationHandle = null;
    }
    if (this.vfcHandle !== null && this.video && 'cancelVideoFrameCallback' in this.video) {
      (this.video as unknown as { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(this.vfcHandle);
      this.vfcHandle = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }

    this.recognizer.reset();

    // Broadcast null frame on stop so listeners immediately drop hand pointer
    if (this.video) {
      for (const cb of this.callbacks) cb(null, this.video);
    }
  }

  private scheduleNextFrame() {
    if (this.status !== 'running') return;

    if (this.video && 'requestVideoFrameCallback' in this.video) {
      this.vfcHandle = (this.video as unknown as {
        requestVideoFrameCallback: (cb: (now: DOMHighResTimeStamp, metadata: unknown) => void) => number;
      }).requestVideoFrameCallback((now) => {
        this.processVideoFrame(now);
        this.scheduleNextFrame();
      });
    } else {
      this.animationHandle = requestAnimationFrame((now) => {
        this.processVideoFrame(now);
        this.scheduleNextFrame();
      });
    }
  }

  private processVideoFrame(now: number) {
    if (this.status !== 'running' || !this.video || !this.landmarker) return;
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    // MediaPipe video mode requires strictly monotonic timestamps
    const timestamp = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    this.lastTimestamp = timestamp;

    // Track FPS
    this.frameCount += 1;
    if (now - this.lastFpsCalc >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsCalc));
      this.frameCount = 0;
      this.lastFpsCalc = now;
    }

    try {
      const results = this.landmarker.detectForVideo(this.video, timestamp);

      let landmarks: HandPoint[] | null = null;
      let confidence = 0;

      if (results.landmarks && results.landmarks.length > 0) {
        const rawLandmarks = results.landmarks[0];
        landmarks = rawLandmarks.map((l) => ({ x: l.x, y: l.y, z: l.z }));
        const handedness = results.handednesses?.[0]?.[0];
        confidence = handedness ? handedness.score : 0.9;
      }

      const handFrame = this.recognizer.process(landmarks, confidence, timestamp);

      for (const cb of this.callbacks) {
        cb(handFrame, this.video);
      }
    } catch (e) {
      console.warn('MediaPipe detection error:', e);
    }
  }
}

export const handTracker = new HandTracker();
