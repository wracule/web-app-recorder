/**
 * Stub for @mediapipe/selfie_segmentation so Vite can bundle @tensorflow-models/body-segmentation.
 * The upstream package still imports this symbol even when using the TF.js selfie runtime;
 * we never instantiate this class — MediaPipe runtime is unused.
 */
export class SelfieSegmentation {
  constructor(_config?: unknown) {}

  async close(): Promise<void> {}

  onResults(_listener: unknown): void {}

  async initialize(): Promise<void> {}

  reset(): void {}

  async send(_inputs: unknown): Promise<void> {}

  setOptions(_options: unknown): void {}
}

export const VERSION = '0.0.0-stub'
