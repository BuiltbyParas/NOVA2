/**
 * Adaptive signal smoothing using the 1€ (One Euro) filter.
 *
 * Provides tremor-free hover stability at low velocities and lag-free tracking
 * during quick gestures by dynamically adjusting the low-pass cutoff based on speed.
 */

class LowPassFilter {
  private s = 0;
  private initialized = false;

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
      return value;
    }
    this.s = alpha * value + (1 - alpha) * this.s;
    return this.s;
  }

  reset() {
    this.initialized = false;
  }

  lastValue(): number {
    return this.s;
  }
}

export class OneEuroFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;

  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime = 0;

  constructor(minCutoff = 1.2, beta = 0.015, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, timestamp: number): number {
    if (this.lastTime === 0) {
      this.lastTime = timestamp;
      return this.xFilter.filter(value, 1.0);
    }

    const dt = Math.max(0.001, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;

    const prevX = this.xFilter.lastValue();
    const dx = (value - prevX) / dt;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(value, this.alpha(cutoff, dt));
  }

  reset() {
    this.lastTime = 0;
    this.xFilter.reset();
    this.dxFilter.reset();
  }
}

export class Point2DSmoother {
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;

  constructor(minCutoff = 1.2, beta = 0.015) {
    this.filterX = new OneEuroFilter(minCutoff, beta);
    this.filterY = new OneEuroFilter(minCutoff, beta);
  }

  updateConfig(minCutoff: number, beta: number) {
    this.filterX.minCutoff = minCutoff;
    this.filterX.beta = beta;
    this.filterY.minCutoff = minCutoff;
    this.filterY.beta = beta;
  }

  filter(x: number, y: number, timestamp: number): { x: number; y: number } {
    return {
      x: this.filterX.filter(x, timestamp),
      y: this.filterY.filter(y, timestamp),
    };
  }

  reset() {
    this.filterX.reset();
    this.filterY.reset();
  }
}
