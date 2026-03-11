/**
 * Web Worker: builds the deterministic Galton-board path off the main thread
 * so that creating new balls never blocks animation.
 */
import { buildDeterministicPath } from './physicsSim';
import type { RecordedPath } from './physicsSim';

self.onmessage = (e: MessageEvent<{ rows: number; slotIndex: number; ballRadius: number }>) => {
  const { rows, slotIndex, ballRadius } = e.data;
  try {
    const path = buildDeterministicPath(rows, slotIndex, ballRadius);
    self.postMessage({ path } as { path: RecordedPath });
  } catch (err) {
    self.postMessage({ error: String(err instanceof Error ? err.message : err) });
  }
};
