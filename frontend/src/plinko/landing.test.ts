import { describe, it, expect } from 'vitest';
import { buildDeterministicPath, interpolatePath } from './physicsSim';
import { getSlotXBounds, getBallRadiusForRows, getSlotY, SLOT_ROW_HEIGHT } from './boardLayout';

describe('ball appears to land at slot centre', () => {
  const ROWS_LIST = [8, 10, 12, 14];

  for (const rows of ROWS_LIST) {
    const ballRadius = getBallRadiusForRows(rows);
    const slotTopY = getSlotY(rows) - SLOT_ROW_HEIGHT / 2;
    // drawBalls() stops rendering at this y (matches Board.tsx line 144)
    const lastDrawY = slotTopY - 2 * ballRadius;

    for (let slotIndex = 0; slotIndex <= rows; slotIndex++) {
      it(`rows=${rows} slot=${slotIndex}: visible position at cutoff y is within middle 70%`, () => {
        const path = buildDeterministicPath(rows, slotIndex, ballRadius);
        const bounds = getSlotXBounds(rows, slotIndex);
        const slotWidth = bounds.right - bounds.left;

        // Find the x position at the exact draw-cutoff y by scanning positions
        // (interpolatePath uses simTime, so we find the simTime where y crosses lastDrawY)
        let cutoffX = path.finalX;
        for (let i = 1; i < path.positions.length; i++) {
          const prev = path.positions[i - 1]!;
          const curr = path.positions[i]!;
          if (prev.y <= lastDrawY && curr.y >= lastDrawY) {
            // Linear interpolation to find x at lastDrawY
            const alpha = (lastDrawY - prev.y) / (curr.y - prev.y);
            cutoffX = prev.x + alpha * (curr.x - prev.x);
            break;
          }
        }

        const pct = (cutoffX - bounds.left) / slotWidth * 100;
        console.log(
          `rows=${rows} slot=${slotIndex}: cutoffX=${cutoffX.toFixed(2)}` +
          `  centre=${((bounds.left+bounds.right)/2).toFixed(2)}` +
          `  bounds=[${bounds.left.toFixed(2)}, ${bounds.right.toFixed(2)}]` +
          `  pct=${pct.toFixed(1)}%`
        );

        // Must be within [30%, 70%] — clearly in the middle of the slot
        expect(pct, `rows=${rows} slot=${slotIndex}: ${pct.toFixed(1)}% is not near centre`).toBeGreaterThanOrEqual(30);
        expect(pct, `rows=${rows} slot=${slotIndex}: ${pct.toFixed(1)}% is not near centre`).toBeLessThanOrEqual(70);
      });
    }
  }
});
