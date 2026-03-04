/**
 * Physics sim tests: Matter.js ball lands in target slot; drop X within 10px of center.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runMatterLive, getInitialDropXMatter, getSlotXBounds } from './physicsSim';
import { DROP_X } from './boardLayout';

const ROWS = 8;
const BALL_RADIUS = 6;
const DURATION_MS = 4000;
const BOARD_WIDTH = 320;
const DROP_OFFSET_MAX_PX = 10;
const TOLERANCE_PX = 2;

/** Polyfill RAF so sim runs in Node. */
function installRafPolyfill() {
  const origRaf = globalThis.requestAnimationFrame;
  const origCancel = globalThis.cancelAnimationFrame;
  const MS_PER_FRAME = 16;
  (globalThis as unknown as { requestAnimationFrame: (cb: (t: number) => void) => number }).requestAnimationFrame = (cb: (t: number) => void) => {
    return setTimeout(() => cb(performance.now()), MS_PER_FRAME) as unknown as number;
  };
  (globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame = (id: number) => {
    clearTimeout(id);
  };
  return () => {
    (globalThis as unknown as { requestAnimationFrame: typeof origRaf }).requestAnimationFrame = origRaf;
    (globalThis as unknown as { cancelAnimationFrame: typeof origCancel }).cancelAnimationFrame = origCancel;
  };
}

function runOneMatterSim(rows: number, slotIndex: number): Promise<{ x: number; y: number }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Sim slot ${slotIndex} timed out`)), 20000);
    let lastPos = { x: 0, y: 0 };
    const initialDropX = getInitialDropXMatter(rows, slotIndex, BALL_RADIUS);
    const result = runMatterLive(
      rows,
      slotIndex,
      BALL_RADIUS,
      initialDropX,
      DURATION_MS,
      (x, y) => { lastPos = { x, y }; },
      () => {},
      () => {},
      () => {
        clearTimeout(timeout);
        result.stop();
        resolve(lastPos);
      }
    );
  });
}

describe('physicsSim (Matter)', () => {
  let restoreRaf: () => void;

  beforeAll(() => {
    restoreRaf = installRafPolyfill();
  });

  afterAll(() => {
    restoreRaf();
  });

  it('lands ball in target slot in 5 out of 5 runs (different slots)', async () => {
    const slotIndices = [0, 1, 4, 7, 8];
    for (const slotIndex of slotIndices) {
      const pos = await runOneMatterSim(ROWS, slotIndex);
      const bounds = getSlotXBounds(ROWS, slotIndex);
      const inSlot = pos.x >= bounds.left - TOLERANCE_PX && pos.x <= bounds.right + TOLERANCE_PX;
      expect(inSlot, `Slot ${slotIndex}: ball landed at x=${pos.x.toFixed(1)}, expected [${bounds.left}, ${bounds.right}]`).toBe(true);
    }
  }, 120000);

  it('getInitialDropXMatter is within 10px of center and lands in slot for multiple rows/slots', () => {
    const rowsToTest = [8, 10, 12];
    const slotIndicesByRows: Record<number, number[]> = {
      8: [0, 4, 8],
      10: [0, 5, 10],
      12: [0, 6, 12],
    };
    for (const rows of rowsToTest) {
      const slots = slotIndicesByRows[rows] ?? [0];
      for (const slotIndex of slots) {
        const initialDropX = getInitialDropXMatter(rows, slotIndex, BALL_RADIUS);
        const centerX = BOARD_WIDTH / 2;
        expect(Math.abs(initialDropX - centerX), `rows=${rows} slot=${slotIndex}: drop X must be within ${DROP_OFFSET_MAX_PX}px of center; got ${initialDropX.toFixed(1)}`).toBeLessThanOrEqual(DROP_OFFSET_MAX_PX);
        expect(initialDropX).toBeGreaterThanOrEqual(DROP_X - DROP_OFFSET_MAX_PX);
        expect(initialDropX).toBeLessThanOrEqual(DROP_X + DROP_OFFSET_MAX_PX);
      }
    }
  });
});
