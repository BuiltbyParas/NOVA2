import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * Small procedural textures. Generated once rather than shipped as files.
 *
 * The room's backdrop and floor field used to be canvas textures here; Phase 11
 * draws them as shaders instead (`components/spatial/environmentShaders.ts`).
 */

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
