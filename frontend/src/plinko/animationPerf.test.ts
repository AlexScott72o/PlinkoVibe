/**
 * Performance tests for plinko animation: physics record time and tick/frame budget.
 */
import { describe, it, expect } from 'vitest';
import { runMatterRecord, interpolatePath, getInitialDropXMatter } from './physicsSim';
import { getBallRadiusForRows } from './boardLayout';

const ROWS = 10;
const TRAIL_MAX = 6;
const TRAIL_ABOVE_COUNT = 25;
const TRAIL_REDUCED_MAX = 2;
const FRAMES_TO_SIMULATE = 60;
const MAX_MS_PER_FRAME = 12;
const MAX_RECORD_MS = 250;

function buildMockPath(numPositions: number): { positions: { simTime: number; x: number; y: number }[]; totalSimTime: number; finalX: number; finalY: number } {
  const positions: { simTime: number; x: number; y: number }[] = [];
  const totalSimTime = 4000;
  for (let i = 0; i < numPositions; i++) {
    const t = (i / (numPositions - 1)) * totalSimTime;
    positions.push({
      simTime: t,
      x: 160 + 80 * Math.sin(t / 500),
      y: 24 + (t / totalSimTime) * 200,
    });
  }
  const last = positions[positions.length - 1];
  return { positions, totalSimTime, finalX: last.x, finalY: last.y };
}

describe('animation performance', () => {
  it('runMatterRecord completes within budget for one ball', () => {
    const ballRadius = getBallRadiusForRows(ROWS);
    const initialDropX = getInitialDropXMatter(ROWS, 5, ballRadius);
    const start = performance.now();
    const path = runMatterRecord(ROWS, 5, ballRadius, initialDropX);
    const elapsed = performance.now() - start;
    expect(path.positions.length).toBeGreaterThan(0);
    expect(elapsed, `runMatterRecord took ${elapsed.toFixed(0)}ms, max ${MAX_RECORD_MS}ms`).toBeLessThan(MAX_RECORD_MS);
  });

  it('tick simulation (interpolate + trail) stays under frame budget for 50 balls', () => {
    const ballCount = 50;
    const trailCap = ballCount > TRAIL_ABOVE_COUNT ? TRAIL_REDUCED_MAX : TRAIL_MAX;
    const mock = buildMockPath(400);
    const start = performance.now();
    let positions: Record<number, { x: number; y: number; trail: { x: number; y: number }[] }> = {};
    for (let id = 0; id < ballCount; id++) {
      positions[id] = { x: mock.positions[0].x, y: mock.positions[0].y, trail: [] };
    }
    for (let frame = 0; frame < FRAMES_TO_SIMULATE; frame++) {
      const progress = Math.min(1, (frame * 20) / mock.totalSimTime);
      const simTime = mock.totalSimTime * progress;
      const next: Record<number, { x: number; y: number; trail: { x: number; y: number }[] }> = {};
      for (let id = 0; id < ballCount; id++) {
        const { x, y } = interpolatePath(mock.positions, simTime);
        const prev = positions[id];
        const trail = prev ? [...prev.trail, { x, y }].slice(-trailCap) : [{ x, y }];
        next[id] = { x, y, trail };
      }
      positions = next;
    }
    const elapsed = performance.now() - start;
    const avgMsPerFrame = elapsed / FRAMES_TO_SIMULATE;
    expect(avgMsPerFrame, `tick sim 50 balls: ${avgMsPerFrame.toFixed(2)}ms/frame, max ${MAX_MS_PER_FRAME}ms`).toBeLessThan(MAX_MS_PER_FRAME);
  });

  it('tick simulation stays under frame budget for 100 balls', () => {
    const ballCount = 100;
    const trailCap = ballCount > TRAIL_ABOVE_COUNT ? TRAIL_REDUCED_MAX : TRAIL_MAX;
    const mock = buildMockPath(400);
    const start = performance.now();
    let positions: Record<number, { x: number; y: number; trail: { x: number; y: number }[] }> = {};
    for (let id = 0; id < ballCount; id++) {
      positions[id] = { x: mock.positions[0].x, y: mock.positions[0].y, trail: [] };
    }
    for (let frame = 0; frame < FRAMES_TO_SIMULATE; frame++) {
      const progress = Math.min(1, (frame * 20) / mock.totalSimTime);
      const simTime = mock.totalSimTime * progress;
      const next: Record<number, { x: number; y: number; trail: { x: number; y: number }[] }> = {};
      for (let id = 0; id < ballCount; id++) {
        const { x, y } = interpolatePath(mock.positions, simTime);
        const prev = positions[id];
        const trail = prev ? [...prev.trail, { x, y }].slice(-trailCap) : [{ x, y }];
        next[id] = { x, y, trail };
      }
      positions = next;
    }
    const elapsed = performance.now() - start;
    const avgMsPerFrame = elapsed / FRAMES_TO_SIMULATE;
    expect(avgMsPerFrame, `tick sim 100 balls: ${avgMsPerFrame.toFixed(2)}ms/frame, max ${MAX_MS_PER_FRAME}ms`).toBeLessThan(MAX_MS_PER_FRAME);
  });
});
