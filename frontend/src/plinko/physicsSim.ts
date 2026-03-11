/**
 * Matter.js live physics (energetic params only). Ball drop uses getInitialDropX + runMatterLive.
 */

import Matter from 'matter-js';
import {
  BOARD_WIDTH,
  BOUNDS_MARGIN,
  PEG_COLLISION_R,
  DROP_X,
  DROP_Y,
  LANDED_VY_THRESHOLD,
  MAX_PHYSICS_MS,
  SLOT_ROW_HEIGHT,
  getPegPositions,
  getTargetSlotX,
  getSlotY,
  getSlotBottom,
  getSlotXBounds,
} from './boardLayout';

export { getSlotXBounds, getSlotCenter } from './boardLayout';

const UPDATES_PER_FRAME = 3;
const STEP_MS = 12;
const STEP_SIM_MS = STEP_MS * UPDATES_PER_FRAME;

/** Energetic params (user's preferred feel). */
const GRAVITY_Y = 0.022;
const INITIAL_VY = 0.82;
const BALL_RESTITUTION = 0.82;
const PEG_RESTITUTION = 0.85;
const BALL_FRICTION = 0.0003;
const FRICTION_AIR = 0.00005;
const VX_MAX = 0.48;

const DROP_X_SEARCH_MIN = -10;
const DROP_X_SEARCH_MAX = 10;
const DROP_X_SEARCH_STEPS = 55;

export interface PhysicsRunResult {
  stop: () => void;
}

/** Run one Matter sim with given initial drop X; returns landing position and peg hit count. */
function matterSimLanding(
  rows: number,
  ballRadius: number,
  initialDropX: number
): { landingX: number; landingY: number; pegHits: number } {
  const pegPositions = getPegPositions(rows);
  const slotY = getSlotY(rows);
  const minX = ballRadius + BOUNDS_MARGIN;
  const maxX = BOARD_WIDTH - ballRadius - BOUNDS_MARGIN;
  const pegHit = new Set<number>();

  const engine = Matter.Engine.create({
    gravity: { x: 0, y: GRAVITY_Y },
    positionIterations: 8,
    velocityIterations: 6,
  });
  const world = engine.world;

  const ball = Matter.Bodies.circle(initialDropX, DROP_Y, ballRadius, {
    restitution: BALL_RESTITUTION,
    friction: BALL_FRICTION,
    frictionAir: FRICTION_AIR,
  });
  Matter.Body.setVelocity(ball, { x: 0, y: INITIAL_VY });

  const pegBodies: Matter.Body[] = [];
  pegPositions.forEach((p) => {
    const body = Matter.Bodies.circle(p.x, p.y, PEG_COLLISION_R, {
      isStatic: true,
      restitution: PEG_RESTITUTION,
    });
    pegBodies.push(body);
    Matter.World.add(world, body);
  });
  Matter.World.add(world, ball);

  const stepMs = STEP_MS * UPDATES_PER_FRAME;
  const maxSteps = Math.ceil(MAX_PHYSICS_MS / stepMs);

  for (let step = 0; step < maxSteps; step++) {
    for (let i = 0; i < UPDATES_PER_FRAME; i++) {
      Matter.Engine.update(engine, STEP_MS);
      const ax = ball.position.x;
      if (ax < minX) {
        Matter.Body.setPosition(ball, { x: minX, y: ball.position.y });
        Matter.Body.setVelocity(ball, { x: 0, y: ball.velocity.y });
      } else if (ax > maxX) {
        Matter.Body.setPosition(ball, { x: maxX, y: ball.position.y });
        Matter.Body.setVelocity(ball, { x: 0, y: ball.velocity.y });
      } else {
        const v = ball.velocity;
        if (Math.abs(v.x) > VX_MAX) Matter.Body.setVelocity(ball, { x: Math.sign(v.x) * VX_MAX, y: v.y });
      }
    }
    const px = ball.position.x;
    const py = ball.position.y;
    pegPositions.forEach((p) => {
      const dist = Math.hypot(p.x - px, p.y - py);
      if (dist < PEG_COLLISION_R + ballRadius + 1) pegHit.add(p.rowIndex);
    });
    const vy = ball.velocity.y;
    if (py >= slotY - 10 && Math.abs(vy) < LANDED_VY_THRESHOLD) {
      const landingX = ball.position.x;
      const landingY = Math.min(py, slotY);
      Matter.World.remove(world, ball);
      pegBodies.forEach((b) => Matter.World.remove(world, b));
      return { landingX, landingY, pegHits: pegHit.size };
    }
  }

  const landingX = ball.position.x;
  const landingY = slotY;
  Matter.World.remove(world, ball);
  pegBodies.forEach((b) => Matter.World.remove(world, b));
  return { landingX, landingY, pegHits: pegHit.size };
}

/** Get initial drop X so the ball lands in the target slot (Matter, energetic). */
export function getInitialDropXMatter(
  rows: number,
  slotIndex: number,
  ballRadius: number
): number {
  const { left: slotLeft, right: slotRight } = getSlotXBounds(rows, slotIndex);
  const targetX = getTargetSlotX(rows, slotIndex);
  const slotW = slotRight - slotLeft;

  let bestX = DROP_X;
  let bestDist = Infinity;
  let bestInSlot = false;

  for (let i = 0; i <= DROP_X_SEARCH_STEPS; i++) {
    const t = i / DROP_X_SEARCH_STEPS;
    const initialDropX = DROP_X + DROP_X_SEARCH_MIN + t * (DROP_X_SEARCH_MAX - DROP_X_SEARCH_MIN);
    const { landingX, pegHits } = matterSimLanding(rows, ballRadius, initialDropX);
    if (pegHits < 1) continue; /* require at least one peg hit – no straight drop */
    const inSlot = landingX >= slotLeft && landingX <= slotRight;
    const dist = Math.abs(landingX - targetX);
    if (inSlot && (bestDist > dist || !bestInSlot)) {
      bestX = initialDropX;
      bestDist = dist;
      bestInSlot = true;
      if (dist < slotW * 0.15) break;
    } else if (!bestInSlot && bestDist > dist) {
      bestX = initialDropX;
      bestDist = dist;
    }
  }
  return bestX;
}

export interface RecordedPath {
  positions: { simTime: number; x: number; y: number }[];
  pegHits: { simTime: number; rowIndex: number; pegIndex: number }[];
  totalSimTime: number;
  finalX: number;
  finalY: number;
}

const PATH_CACHE_KEY = (rows: number, slotIndex: number) => `${rows}_${slotIndex}`;
const pathCache = new Map<string, RecordedPath>();

/** Path cache (rows, slotIndex) -> RecordedPath. Same slot reuses path so new balls don't block the main thread. */
export function getCachedPath(rows: number, slotIndex: number): RecordedPath | null {
  return pathCache.get(PATH_CACHE_KEY(rows, slotIndex)) ?? null;
}

/** Clear one cache entry so the next scheduleRecord for that slot will recompute (e.g. after path/slot mismatch). */
export function clearPathCache(rows: number, slotIndex: number): void {
  pathCache.delete(PATH_CACHE_KEY(rows, slotIndex));
}

/** Upsample a path to 2ms resolution so playback interpolation doesn't cut through pegs. */
const PLAYBACK_SAMPLE_MS = 2;

function upsamplePath(
  positions: { simTime: number; x: number; y: number }[],
  stepMs: number
): { simTime: number; x: number; y: number }[] {
  if (positions.length <= 1) return positions;
  const out: { simTime: number; x: number; y: number }[] = [];
  const n = Math.round(stepMs / PLAYBACK_SAMPLE_MS);
  for (let i = 0; i < positions.length; i++) {
    out.push(positions[i]!);
    const a = positions[i]!;
    const b = positions[i + 1];
    if (!b) continue;
    for (let j = 1; j < n; j++) {
      const t = a.simTime + (j * (b.simTime - a.simTime)) / n;
      const u = j / n;
      out.push({
        simTime: t,
        x: a.x + u * (b.x - a.x),
        y: a.y + u * (b.y - a.y),
      });
    }
  }
  return out;
}

/** Ensure there is at least one peg hit recorded per row, so the visual peg path always includes every row. */
function ensureRowPegHits(
  pegHits: { simTime: number; rowIndex: number; pegIndex: number }[],
  positions: { simTime: number; x: number; y: number }[],
  pegPositions: { x: number; y: number; rowIndex: number }[],
  rows: number
): void {
  if (positions.length === 0 || pegPositions.length === 0) return;
  const rowYs: number[] = [];
  for (let r = 0; r < rows; r++) {
    const peg = pegPositions.find((p) => p.rowIndex === r);
    rowYs[r] = peg ? peg.y : 0;
  }
  for (let r = 0; r < rows; r++) {
    const hasHit = pegHits.some((h) => h.rowIndex === r);
    if (hasHit) continue;
    const rowY = rowYs[r];
    if (!rowY) continue;
    const pos = positions.find((p) => p.y >= rowY);
    if (!pos) continue;
    const candidates: { idx: number; x: number }[] = [];
    pegPositions.forEach((p, idx) => {
      if (p.rowIndex === r) candidates.push({ idx, x: p.x });
    });
    if (!candidates.length) continue;
    let best = candidates[0]!;
    let bestDx = Math.abs(best.x - pos.x);
    for (let i = 1; i < candidates.length; i++) {
      const dx = Math.abs(candidates[i]!.x - pos.x);
      if (dx < bestDx) {
        best = candidates[i]!;
        bestDx = dx;
      }
    }
    pegHits.push({ simTime: pos.simTime, rowIndex: r, pegIndex: best.idx });
  }
  pegHits.sort((a, b) => a.simTime - b.simTime);
}

/** Run Matter.js to completion and record path (sync). Used for playback over durationMs.
 * Physics runs at 12ms steps (same as elsewhere) so outcome and landing slot are correct.
 * Path is upsampled to 2ms for smooth playback without cutting through pegs.
 */
export function runMatterRecord(
  rows: number,
  slotIndex: number,
  ballRadius: number,
  initialDropX: number
): RecordedPath {
  const pegPositions = getPegPositions(rows);
  const targetX = getTargetSlotX(rows, slotIndex);
  const slotY = getSlotY(rows);
  const slotBottom = getSlotBottom(rows);
  const maxDisplayY = slotBottom - ballRadius;
  const slotTop = slotY - SLOT_ROW_HEIGHT / 2;
  const { left: slotLeft, right: slotRight } = getSlotXBounds(rows, slotIndex);
  const positions: { simTime: number; x: number; y: number }[] = [];
  const pegHits: { simTime: number; rowIndex: number; pegIndex: number }[] = [];
  const pegHit = new Set<number>();

  const engine = Matter.Engine.create({
    gravity: { x: 0, y: GRAVITY_Y },
    positionIterations: 8,
    velocityIterations: 6,
  });
  const world = engine.world;

  const ball = Matter.Bodies.circle(initialDropX, DROP_Y, ballRadius, {
    restitution: BALL_RESTITUTION,
    friction: BALL_FRICTION,
    frictionAir: FRICTION_AIR,
  });
  Matter.Body.setVelocity(ball, { x: 0, y: INITIAL_VY });

  const pegBodies: Matter.Body[] = [];
  pegPositions.forEach((p, pegIndex) => {
    const body = Matter.Bodies.circle(p.x, p.y, PEG_COLLISION_R, {
      isStatic: true,
      restitution: PEG_RESTITUTION,
    });
    const ext = body as Matter.Body & { _rowIndex?: number; _pegIndex?: number };
    ext._rowIndex = p.rowIndex;
    ext._pegIndex = pegIndex;
    pegBodies.push(body);
    Matter.World.add(world, body);
  });
  Matter.World.add(world, ball);

  const minX = ballRadius + BOUNDS_MARGIN;
  const maxX = BOARD_WIDTH - ballRadius - BOUNDS_MARGIN;
  const maxSteps = Math.ceil(MAX_PHYSICS_MS / STEP_SIM_MS) * UPDATES_PER_FRAME;
  let simTime = 0;

  for (let step = 0; step < maxSteps; step++) {
    Matter.Engine.update(engine, STEP_MS);
    const ax = ball.position.x;
    if (ax < minX) {
      Matter.Body.setPosition(ball, { x: minX, y: ball.position.y });
      Matter.Body.setVelocity(ball, { x: 0, y: ball.velocity.y });
    } else if (ax > maxX) {
      Matter.Body.setPosition(ball, { x: maxX, y: ball.position.y });
      Matter.Body.setVelocity(ball, { x: 0, y: ball.velocity.y });
    } else {
      const v = ball.velocity;
      if (Math.abs(v.x) > VX_MAX) Matter.Body.setVelocity(ball, { x: Math.sign(v.x) * VX_MAX, y: v.y });
    }
    simTime += STEP_MS;
    const px = ball.position.x;
    const py = ball.position.y;
    const vy = ball.velocity.y;

    pegBodies.forEach((peg) => {
      const ext = peg as Matter.Body & { _rowIndex?: number; _pegIndex?: number };
      const rowIndex = ext._rowIndex ?? 0;
      const pegIndex = ext._pegIndex ?? 0;
      const dist = Math.hypot(peg.position.x - px, peg.position.y - py);
      if (dist < PEG_COLLISION_R + ballRadius + 1 && !pegHit.has(pegIndex)) {
        pegHit.add(pegIndex);
        pegHits.push({ simTime, rowIndex, pegIndex });
      }
    });

    const displayY = Math.min(py, maxDisplayY);
    positions.push({ simTime, x: px, y: displayY });

    const landed = py >= slotY - 10 && Math.abs(vy) < LANDED_VY_THRESHOLD;
    if (landed) {
      const finalX = px < slotLeft || px > slotRight ? targetX : Math.max(slotLeft, Math.min(slotRight, px));
      // Clamp landing Y so the ball center is just above the slot top (never inside the slot visuals).
      const rawFinalY = Math.min(py, maxDisplayY);
      const maxLandingCenterY = slotTop - ballRadius;
      const finalY = Math.min(rawFinalY, maxLandingCenterY);
      positions[positions.length - 1] = { simTime, x: finalX, y: finalY };
      ensureRowPegHits(pegHits, positions, pegPositions, rows);
      Matter.World.remove(world, ball);
      pegBodies.forEach((b) => Matter.World.remove(world, b));
      const upsampled = upsamplePath(positions, STEP_MS);
      return { positions: upsampled, pegHits, totalSimTime: simTime, finalX, finalY };
    }
  }

  const last = positions[positions.length - 1]!;
  let finalX = last.x;
  if (finalX < slotLeft || finalX > slotRight) finalX = targetX;
  else finalX = Math.max(slotLeft, Math.min(slotRight, finalX));
  const maxLandingCenterY = slotTop - ballRadius;
  const finalY = Math.min(maxDisplayY, maxLandingCenterY);
  positions[positions.length - 1] = { simTime, x: finalX, y: finalY };
  ensureRowPegHits(pegHits, positions, pegPositions, rows);
  Matter.World.remove(world, ball);
  pegBodies.forEach((b) => Matter.World.remove(world, b));
  const upsampled = upsamplePath(positions, STEP_MS);
  return { positions: upsampled, pegHits, totalSimTime: simTime, finalX, finalY: maxDisplayY };
}

export function interpolatePath(
  positions: { simTime: number; x: number; y: number }[],
  simTime: number
): { x: number; y: number } {
  if (positions.length === 0) return { x: 0, y: 0 };
  if (simTime <= positions[0].simTime) return { x: positions[0].x, y: positions[0].y };
  if (simTime >= positions[positions.length - 1].simTime) {
    const p = positions[positions.length - 1];
    return { x: p.x, y: p.y };
  }
  let i = 0;
  while (i + 1 < positions.length && positions[i + 1].simTime < simTime) i++;
  const a = positions[i];
  const b = positions[i + 1];
  const t = (simTime - a.simTime) / (b.simTime - a.simTime);
  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

/** Returns the final (clamped) landing position for the given config. Used by tests to verify slot alignment without RAF. */
export function getRecordedLandingPosition(
  rows: number,
  slotIndex: number,
  ballRadius: number
): { x: number; y: number } {
  const initialDropX = getInitialDropXMatter(rows, slotIndex, ballRadius);
  const path = runMatterRecord(rows, slotIndex, ballRadius, initialDropX);
  return { x: path.finalX, y: path.finalY };
}

/** Run Matter.js path and play it back over durationMs (respects speed setting). */
export function runMatterLive(
  rows: number,
  slotIndex: number,
  ballRadius: number,
  initialDropX: number,
  durationMs: number,
  onPosition: (x: number, y: number) => void,
  onPegHit: (pegIndex: number) => void,
  onLand: () => void,
  onComplete: () => void
): PhysicsRunResult {
  const path = runMatterRecord(rows, slotIndex, ballRadius, initialDropX);
  const { positions, pegHits, totalSimTime, finalX, finalY } = path;
  if (positions.length === 0) {
    onPosition(finalX, finalY);
    onLand();
    onComplete();
    return { stop: () => {} };
  }

  let rafId = 0;
  const startTime = performance.now();
  let pegHitIndex = 0;

  const tick = () => {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const simTime = totalSimTime * progress;

    while (pegHitIndex < pegHits.length && pegHits[pegHitIndex].simTime <= simTime) {
      onPegHit(pegHits[pegHitIndex].pegIndex);
      pegHitIndex++;
    }

    if (progress >= 1) {
      onPosition(finalX, finalY);
      onLand();
      onComplete();
      return;
    }

    const { x, y } = interpolatePath(positions, simTime);
    onPosition(x, y);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return {
    stop: () => cancelAnimationFrame(rafId),
  };
}

/** Queue for physics recording: run in worker (or sync fallback) so the main thread never blocks. */
type RecordRequest = {
  rows: number;
  slotIndex: number;
  ballRadius: number;
  resolve: (path: RecordedPath) => void;
  reject: (e: unknown) => void;
};
const recordQueue: RecordRequest[] = [];
let recordWorker: Worker | null = null;
let workerBusy = false;

function getWorker(): Worker | null {
  if (recordWorker != null) return recordWorker;
  if (typeof Worker === 'undefined') return null;
  try {
    recordWorker = new Worker(new URL('./physicsRecord.worker.ts', import.meta.url), { type: 'module' });
    recordWorker.onmessage = (e: MessageEvent<{ path?: RecordedPath; error?: string }>) => {
      workerBusy = false;
      const req = recordQueue.shift();
      if (!req) return;
      if (e.data.error) {
        req.reject(new Error(e.data.error));
      } else if (e.data.path) {
        pathCache.set(PATH_CACHE_KEY(req.rows, req.slotIndex), e.data.path);
        req.resolve(e.data.path);
      }
      if (recordQueue.length > 0) processNextRecord();
    };
    recordWorker.onerror = () => {
      workerBusy = false;
      const req = recordQueue.shift();
      if (req) req.reject(new Error('Physics worker error'));
      if (recordQueue.length > 0) processNextRecord();
    };
    return recordWorker;
  } catch {
    return null;
  }
}

function runRecordSync(rows: number, slotIndex: number, ballRadius: number): RecordedPath {
  const initialDropX = getInitialDropXMatter(rows, slotIndex, ballRadius);
  return runMatterRecord(rows, slotIndex, ballRadius, initialDropX);
}

function processNextRecord(): void {
  if (recordQueue.length === 0 || workerBusy) return;
  const req = recordQueue[0]!;
  const key = PATH_CACHE_KEY(req.rows, req.slotIndex);
  const cached = pathCache.get(key);
  if (cached) {
    recordQueue.shift();
    req.resolve(cached);
    processNextRecord();
    return;
  }
  const w = getWorker();
  if (w) {
    workerBusy = true;
    w.postMessage({ rows: req.rows, slotIndex: req.slotIndex, ballRadius: req.ballRadius });
  } else {
    recordQueue.shift();
    try {
      const path = runRecordSync(req.rows, req.slotIndex, req.ballRadius);
      pathCache.set(key, path);
      req.resolve(path);
    } catch (e) {
      req.reject(e);
    }
    processNextRecord();
  }
}

/** Schedule a physics record. Uses path cache for same (rows, slotIndex); runs in worker so main thread stays responsive. */
export function scheduleRecord(
  rows: number,
  slotIndex: number,
  ballRadius: number
): Promise<RecordedPath> {
  const key = PATH_CACHE_KEY(rows, slotIndex);
  const cached = pathCache.get(key);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    recordQueue.push({ rows, slotIndex, ballRadius, resolve, reject });
    if (recordQueue.length === 1) processNextRecord();
  });
}
