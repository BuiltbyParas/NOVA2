import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/** Small procedural textures. Generated once rather than shipped as files. */

/** Soft radial falloff used for the environment backdrop. */
export function createBackdropTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(128, 104, 20, 128, 128, 180);
    gradient.addColorStop(0, '#FBFBF9');
    gradient.addColorStop(0.55, '#F2F2EF');
    gradient.addColorStop(1, '#E6E6E2');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * A soft circular shadow, fading to nothing at the edge.
 *
 * Objects in NOVA float in an open space with nothing close enough behind them to
 * catch a cast shadow, so weight is given locally instead: a gentle darkening sits
 * just behind an object and travels with it.
 */
export function createSoftShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(24,26,30,0.55)');
    gradient.addColorStop(0.45, 'rgba(24,26,30,0.26)');
    gradient.addColorStop(1, 'rgba(24,26,30,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The spatial field: a faint grid, fading to nothing at its edges.
 *
 * NOVA's windows float in an open room, and an open room with no floor gives a
 * viewer nothing to measure depth against — which is why the environment read
 * as a flat backdrop with rectangles on it rather than as a space. A grid is
 * the cheapest honest depth cue there is: perspective does all the work, and
 * the lines cost one texture and one plane.
 *
 * Drawn deliberately close to the background colour. It should be findable when
 * looked for and invisible when not, because the subject of the environment is
 * the windows.
 */
export function createFieldTexture(size = 512, cells = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, size, size);
    const step = size / cells;
    context.lineWidth = 1;

    for (let i = 0; i <= cells; i += 1) {
      // Every fourth line is a little stronger, so the grid has a readable
      // rhythm instead of dissolving into an even wash at distance.
      context.strokeStyle = i % 4 === 0 ? 'rgba(23,24,26,0.16)' : 'rgba(23,24,26,0.07)';
      const at = Math.round(i * step) + 0.5;
      context.beginPath();
      context.moveTo(at, 0);
      context.lineTo(at, size);
      context.moveTo(0, at);
      context.lineTo(size, at);
      context.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/**
 * A radial mask that fades the field out before it reaches its own edge.
 *
 * Without it the floor ends in a visible straight line, which reads as a sheet
 * of paper rather than as a space continuing past the frame.
 */
export function createFieldFadeTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const half = size / 2;
    const gradient = context.createRadialGradient(half, half, size * 0.06, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
