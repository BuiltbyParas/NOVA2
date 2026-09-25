import { useEffect, useRef, useState } from 'react';
import { useSpatialStore } from '../../state/spatialStore';
import { handTracker } from '../../vision/handTracker';
import { HAND_CONNECTIONS, LANDMARK, type HandFrame } from '../../vision/visionTypes';
import { cursor } from '../../systems/interaction/interactionSystem';

/**
 * Developer Vision Debug Overlay.
 *
 * Displays live camera stream, overlaid MediaPipe skeleton,
 * gesture state machine telemetry, target hit detection, and real-time FPS.
 * Only rendered when explicitly enabled.
 */
export function VisionDebugPanel() {
  const visionDebug = useSpatialStore((state) => state.visionDebug);
  const toggleVisionDebug = useSpatialStore((state) => state.toggleVisionDebug);
  const visionActive = useSpatialStore((state) => state.visionActive);
  const visionStatus = useSpatialStore((state) => state.visionStatus);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const telemetryRef = useRef<HTMLDivElement>(null);
  const [pinchThreshold, setPinchThreshold] = useState(0.38);
  const [smoothingCutoff, setSmoothingCutoff] = useState(1.2);

  useEffect(() => {
    if (!visionDebug) return;

    let animId = 0;
    let latestFrame: HandFrame | null = null;
    let latestVideo: HTMLVideoElement | null = null;

    const unsubscribe = handTracker.onFrame((frame, video) => {
      latestFrame = frame;
      latestVideo = video;
    });

    const draw = () => {
      animId = requestAnimationFrame(draw);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      // Draw background / video
      ctx.clearRect(0, 0, width, height);

      if (latestVideo && latestVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        ctx.save();
        // Mirror video horizontally so it matches natural mirror perception
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(latestVideo, 0, 0, width, height);
        ctx.restore();
      } else {
        ctx.fillStyle = '#111215';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          visionActive ? 'Waiting for camera feed...' : 'Vision is OFF (Press V)',
          width / 2,
          height / 2,
        );
      }

      // Draw hand landmarks and connections
      if (latestFrame && latestFrame.landmarks.length >= 21) {
        const landmarks = latestFrame.landmarks;

        // Draw connections
        ctx.lineWidth = 2;
        ctx.strokeStyle = latestFrame.isPinching
          ? 'rgba(91, 92, 226, 0.85)'
          : 'rgba(255, 255, 255, 0.45)';

        for (const [i1, i2] of HAND_CONNECTIONS) {
          const p1 = landmarks[i1];
          const p2 = landmarks[i2];
          // Remember p.x is 0..1 in raw camera coordinates, mirrored for user view
          const x1 = (1 - p1.x) * width;
          const y1 = p1.y * height;
          const x2 = (1 - p2.x) * width;
          const y2 = p2.y * height;

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // Draw pinch line connecting thumb and index
        const thumb = landmarks[LANDMARK.THUMB_TIP];
        const index = landmarks[LANDMARK.INDEX_TIP];
        const tx = (1 - thumb.x) * width;
        const ty = thumb.y * height;
        const ix = (1 - index.x) * width;
        const iy = index.y * height;

        ctx.beginPath();
        ctx.lineWidth = latestFrame.isPinching ? 3 : 1.5;
        ctx.strokeStyle = latestFrame.isPinching ? '#5b5ce2' : 'rgba(255, 180, 0, 0.6)';
        ctx.moveTo(tx, ty);
        ctx.lineTo(ix, iy);
        ctx.stroke();

        // Draw landmark points
        landmarks.forEach((p, idx) => {
          const px = (1 - p.x) * width;
          const py = p.y * height;

          ctx.beginPath();
          if (idx === LANDMARK.INDEX_TIP) {
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#5b5ce2';
          } else if (idx === LANDMARK.THUMB_TIP) {
            ctx.arc(px, py, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = latestFrame?.isPinching ? '#5b5ce2' : '#ffb400';
          } else {
            ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          }
          ctx.fill();
        });
      }

      // Update text telemetry directly via DOM to avoid React re-rendering at 60fps
      if (telemetryRef.current) {
        const fps = handTracker.getFps();
        const detected = latestFrame?.detected ? 'DETECTED' : 'LOST';
        const confidence = latestFrame ? latestFrame.confidence.toFixed(2) : '0.00';
        const gesture = latestFrame ? latestFrame.gesture : 'IDLE';
        const intent = latestFrame ? latestFrame.intent.toUpperCase() : 'DEFAULT';
        const openPalm = latestFrame?.isOpenPalm ? 'YES' : 'NO';
        const swipe = latestFrame?.swipeDirection ? latestFrame.swipeDirection.toUpperCase() : '—';
        const indexX = latestFrame ? latestFrame.rawIndex.x.toFixed(2) : '—';
        const indexY = latestFrame ? latestFrame.rawIndex.y.toFixed(2) : '—';
        const pinch = latestFrame ? latestFrame.pinchDistance.toFixed(2) : '—';
        const target = cursor.hoveredId || 'none';

        telemetryRef.current.innerHTML = `
          <div class="debug-row"><span class="debug-k">Camera:</span><span class="debug-v ${visionActive ? 'debug-ok' : ''}">${visionStatus.toUpperCase()}</span></div>
          <div class="debug-row"><span class="debug-k">Hand:</span><span class="debug-v ${latestFrame?.detected ? 'debug-ok' : ''}">${detected}</span></div>
          <div class="debug-row"><span class="debug-k">Confidence:</span><span class="debug-v">${confidence}</span></div>
          <div class="debug-row"><span class="debug-k">Gesture:</span><span class="debug-v debug-highlight">${gesture}</span></div>
          <div class="debug-row"><span class="debug-k">Intent:</span><span class="debug-v ${intent !== 'DEFAULT' ? 'debug-ok' : ''}">${intent}</span></div>
          <div class="debug-row"><span class="debug-k">Open Palm:</span><span class="debug-v ${latestFrame?.isOpenPalm ? 'debug-ok' : ''}">${openPalm}</span></div>
          <div class="debug-row"><span class="debug-k">Swipe:</span><span class="debug-v ${latestFrame?.swipeDirection ? 'debug-highlight' : ''}">${swipe}</span></div>
          <div class="debug-row"><span class="debug-k">Index X / Y:</span><span class="debug-v">${indexX}, ${indexY}</span></div>
          <div class="debug-row"><span class="debug-k">Pinch:</span><span class="debug-v ${latestFrame?.isPinching ? 'debug-ok' : ''}">${pinch}</span></div>
          <div class="debug-row"><span class="debug-k">Target:</span><span class="debug-v">${target}</span></div>
          <div class="debug-row"><span class="debug-k">FPS:</span><span class="debug-v">${fps}</span></div>
        `;
      }
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      unsubscribe();
    };
  }, [visionDebug, visionActive, visionStatus]);

  const handlePinchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number.parseFloat(e.target.value);
    setPinchThreshold(val);
    handTracker.updateConfig({ pinchInThreshold: val, pinchOutThreshold: val + 0.14 });
  };

  const handleSmoothingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number.parseFloat(e.target.value);
    setSmoothingCutoff(val);
    handTracker.updateConfig({ smoothingMinCutoff: val });
  };

  if (!visionDebug) return null;

  return (
    <div className="vision-debug-panel">
      <div className="vision-debug-header">
        <span className="vision-debug-title">VISION DEBUG</span>
        <button
          type="button"
          className="vision-debug-close"
          onClick={() => toggleVisionDebug(false)}
          title="Close (D)"
        >
          ✕
        </button>
      </div>

      <div className="vision-debug-body">
        <canvas
          ref={canvasRef}
          width={280}
          height={210}
          className="vision-debug-canvas"
        />

        <div className="vision-debug-telemetry" ref={telemetryRef}>
          {/* Populated directly by animation loop */}
        </div>

        <div className="vision-debug-controls">
          <label className="vision-debug-slider-label">
            Pinch Threshold: {pinchThreshold.toFixed(2)}
            <input
              type="range"
              min="0.2"
              max="0.6"
              step="0.02"
              value={pinchThreshold}
              onChange={handlePinchChange}
            />
          </label>
          <label className="vision-debug-slider-label">
            Smoothing Cutoff: {smoothingCutoff.toFixed(1)} Hz
            <input
              type="range"
              min="0.4"
              max="3.0"
              step="0.1"
              value={smoothingCutoff}
              onChange={handleSmoothingChange}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
