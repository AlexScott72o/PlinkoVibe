/**
 * Web Worker: runs getInitialDropXMatter + runMatterRecord off the main thread
 * so that creating new balls never blocks animation.
 */
import { getInitialDropXMatter, runMatterRecord } from './physicsSim';
import type { RecordedPath } from './physicsSim';

self.onmessage = (e: MessageEvent<{ rows: number; slotIndex: number; ballRadius: number }>) => {
  const { rows, slotIndex, ballRadius } = e.data;
  try {
    const initialDropX = getInitialDropXMatter(rows, slotIndex, ballRadius);
    const path = runMatterRecord(rows, slotIndex, ballRadius, initialDropX);
    self.postMessage({ path } as { path: RecordedPath });
  } catch (err) {
    self.postMessage({ error: String(err instanceof Error ? err.message : err) });
  }
};
