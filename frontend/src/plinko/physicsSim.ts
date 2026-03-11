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
  ROW_HEIGHT_FACTOR,
  PEG_SPACING_FACTOR,
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

/** Run one Matter sim with given initial drop X; returns landing position and peg hit info. */
function matterSimLanding(
  rows: number,
  ballRadius: number,
  initialDropX: number
): { landingX: number; landingY: number; pegHits: number; topRowHit: boolean; rowsHit: boolean[] } {
  const pegPositions = getPegPositions(rows);
  const slotY = getSlotY(rows);
  const minX = ballRadius + BOUNDS_MARGIN;
  const maxX = BOARD_WIDTH - ballRadius - BOUNDS_MARGIN;
  const pegHit = new Set<number>();
  const rowsHit: boolean[] = Array.from({ length: rows }, () => false);

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
      if (dist < PEG_COLLISION_R + ballRadius + 1) {
        pegHit.add(p.rowIndex);
        if (p.rowIndex >= 0 && p.rowIndex < rows) rowsHit[p.rowIndex] = true;
      }
    });
    const vy = ball.velocity.y;
    if (py >= slotY - 10 && Math.abs(vy) < LANDED_VY_THRESHOLD) {
      const landingX = ball.position.x;
      const landingY = Math.min(py, slotY);
      Matter.World.remove(world, ball);
      pegBodies.forEach((b) => Matter.World.remove(world, b));
      return { landingX, landingY, pegHits: pegHit.size, topRowHit: pegHit.has(0), rowsHit };
    }
  }

  const landingX = ball.position.x;
  const landingY = slotY;
  Matter.World.remove(world, ball);
  pegBodies.forEach((b) => Matter.World.remove(world, b));
  return { landingX, landingY, pegHits: pegHit.size, topRowHit: pegHit.has(0), rowsHit };
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

  let bestInSlotX: number | null = null;
  let bestInSlotDist = Infinity;
  let bestFallbackX: number | null = null;
  let bestFallbackDist = Infinity;

  for (let i = 0; i <= DROP_X_SEARCH_STEPS; i++) {
    const t = i / DROP_X_SEARCH_STEPS;
    const initialDropX = DROP_X + DROP_X_SEARCH_MIN + t * (DROP_X_SEARCH_MAX - DROP_X_SEARCH_MIN);
    const { landingX, pegHits, topRowHit, rowsHit } = matterSimLanding(rows, ballRadius, initialDropX);
    if (!topRowHit || pegHits < 1) continue;
    const inSlot = landingX >= slotLeft && landingX <= slotRight;
    if (!inSlot) continue;
    const dist = Math.abs(landingX - targetX);
    const allRowsHit = rowsHit.every((hit) => hit);
    if (allRowsHit) {
      if (dist < bestInSlotDist) {
        bestInSlotDist = dist;
        bestInSlotX = initialDropX;
        if (dist < slotW * 0.15) return bestInSlotX;
      }
    } else if (dist < bestFallbackDist) {
      bestFallbackDist = dist;
      bestFallbackX = initialDropX;
    }
  }
  return bestInSlotX ?? bestFallbackX ?? DROP_X;
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

/** After the last peg row, smoothly guide X toward finalX so the visible path
 *  never drifts horizontally between slots. */
function smoothPathBelowLastPeg(
  positions: { simTime: number; x: number; y: number }[],
  finalX: number,
  pegPositions: { x: number; y: number; rowIndex: number }[],
  slotTop: number
): void {
  const lastPegRowY = pegPositions.reduce((max, p) => Math.max(max, p.y), 0);
  const smoothStart = lastPegRowY;
  const range = slotTop - smoothStart;
  if (range <= 0) return;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p.y > smoothStart) {
      const t = Math.min(1, (p.y - smoothStart) / range);
      const eased = t * t;
      positions[i] = { simTime: p.simTime, x: p.x + eased * (finalX - p.x), y: p.y };
    }
  }
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
      const maxLandingCenterY = slotTop - ballRadius;
      const finalY = Math.min(Math.min(py, maxDisplayY), maxLandingCenterY);
      positions[positions.length - 1] = { simTime, x: finalX, y: finalY };
      smoothPathBelowLastPeg(positions, finalX, pegPositions, slotTop);
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
  smoothPathBelowLastPeg(positions, finalX, pegPositions, slotTop);
  Matter.World.remove(world, ball);
  pegBodies.forEach((b) => Matter.World.remove(world, b));
  const upsampled = upsamplePath(positions, STEP_MS);
  return { positions: upsampled, pegHits, totalSimTime: simTime, finalX, finalY };
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
  const path = buildDeterministicPath(rows, slotIndex, ballRadius);
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

// Timing constants for the deterministic path (in simulated ms, same units as runMatterRecord)
const DET_T_DROP = 500;   // sim ms from spawn to row-0 peg hit
const DET_T_ROW = 700;    // sim ms per inter-peg arc
const DET_FINE_STEPS = 20; // position samples per arc segment
const DET_DROP_STEPS = 10; // position samples for the initial drop

/**
 * Build a deterministic Galton-board path that guarantees:
 *  - exactly one peg hit per row (lit by the real SVG peg lighting)
 *  - the ball never crosses a slot boundary in the visible path
 *
 * Left/right decisions at each row are distributed evenly via Bresenham's
 * line algorithm so that the ball reaches `slotIndex` after `rows` rows.
 */
export function buildDeterministicPath(
  rows: number,
  slotIndex: number,
  ballRadius: number
): RecordedPath {
  const slotWidth = BOARD_WIDTH / (rows + 1);
  const { left: slotLeft, right: slotRight } = getSlotXBounds(rows, slotIndex);
  const rowHeight = slotWidth * ROW_HEIGHT_FACTOR;
  const pegSpacing = slotWidth * PEG_SPACING_FACTOR;
  const pegStartY = 24; // matches boardLayout getPegPositions startY

  const slotY = getSlotY(rows);
  const slotTop = slotY - SLOT_ROW_HEIGHT / 2;
  const slotBottom = getSlotBottom(rows);
  const maxDisplayY = slotBottom - ballRadius;
  const maxLandingY = slotTop - ballRadius;
  // Keep the visible path comfortably inside the target slot so it never
  // appears to cross a neighbouring slot boundary.
  const slotClampMargin = Math.min(ballRadius * 0.6, (slotRight - slotLeft) * 0.15);
  const clampXToSlot = (x: number) =>
    Math.min(slotRight - slotClampMargin, Math.max(slotLeft + slotClampMargin, x));

  // ── Bresenham distribution of rights across rows ──────────────────────────
  // slotIndex rights in `rows` decisions, spread as evenly as possible.
  const decisions: boolean[] = [];
  let bErr = 0;
  for (let r = 0; r < rows; r++) {
    bErr += slotIndex;
    if (bErr * 2 >= rows) {
      decisions.push(true);  // right
      bErr -= rows;
    } else {
      decisions.push(false); // left
    }
  }

  // ── Peg hit at each row ───────────────────────────────────────────────────
  // Row r has r+1 pegs. Peg j in row r:
  //   x = (BOARD_WIDTH - r*pegSpacing)/2 + j*pegSpacing
  //   y = pegStartY + r*rowHeight
  //   globalIndex = r*(r+1)/2 + j
  const hitPegs: { x: number; y: number; rowIndex: number; globalIndex: number }[] = [];
  let cumRights = 0;
  for (let r = 0; r < rows; r++) {
    const pegX = (BOARD_WIDTH - r * pegSpacing) / 2 + cumRights * pegSpacing;
    const pegY = pegStartY + r * rowHeight;
    const globalIndex = (r * (r + 1)) / 2 + cumRights;
    hitPegs.push({ x: pegX, y: pegY, rowIndex: r, globalIndex });
    if (decisions[r]) cumRights++;
  }

  // ── Arc physics: C=2 bounce ───────────────────────────────────────────────
  // y(t) = peg.y - V_BOUNCE*t + 0.5*g_eff*t^2
  // At t=T_ROW → peg.y + rowHeight  (arrives at next peg)
  // Bounce height = rowHeight / 3  (ball rises 1/3 of row height above peg)
  const V_BOUNCE = 2 * rowHeight / DET_T_ROW;
  const g_eff = 6 * rowHeight / (DET_T_ROW * DET_T_ROW);

  const positions: { simTime: number; x: number; y: number }[] = [];
  const pegHits: { simTime: number; rowIndex: number; pegIndex: number }[] = [];

  // ── Phase 1: drop from DROP_Y to row-0 peg ───────────────────────────────
  const firstPeg = hitPegs[0]!;
  positions.push({ simTime: 0, x: DROP_X, y: DROP_Y });
  for (let i = 1; i <= DET_DROP_STEPS; i++) {
    const frac = i / DET_DROP_STEPS;
    positions.push({
      simTime: frac * DET_T_DROP,
      x: DROP_X + (firstPeg.x - DROP_X) * frac,
      y: DROP_Y + (firstPeg.y - DROP_Y) * frac * frac, // ease-in (gravity)
    });
  }
  pegHits.push({ simTime: DET_T_DROP, rowIndex: 0, pegIndex: firstPeg.globalIndex });

  // ── Phase 2: bounce arcs between consecutive pegs ────────────────────────
  for (let r = 0; r < rows - 1; r++) {
    const peg = hitPegs[r]!;
    const nextPeg = hitPegs[r + 1]!;
    const arcStart = DET_T_DROP + r * DET_T_ROW;
    const dx = nextPeg.x - peg.x; // ±pegSpacing/2
    for (let i = 1; i <= DET_FINE_STEPS; i++) {
      const frac = i / DET_FINE_STEPS;
      const t = frac * DET_T_ROW;
      positions.push({
        simTime: arcStart + t,
        x: peg.x + dx * frac,
        y: Math.min(peg.y - V_BOUNCE * t + 0.5 * g_eff * t * t, maxDisplayY),
      });
    }
    pegHits.push({
      simTime: DET_T_DROP + (r + 1) * DET_T_ROW,
      rowIndex: r + 1,
      pegIndex: nextPeg.globalIndex,
    });
  }

  // ── Phase 3: final arc from last peg into slot ───────────────────────────
  // Mirrors Phase 2 arcs exactly: the ball launches UPWARD from the last peg
  // with the same initial velocity V_BOUNCE, then falls into the slot.
  // This produces a genuine curved bounce arc — not a straight downward line —
  // and keeps the path above the peg centre at the start (never below the peg).
  //
  //   y(t) = lastPeg.y - V_BOUNCE*t + 0.5*g_eff*t²   (same as Phase 2 arcs)
  //
  // CRITICAL: drawBalls() stops rendering at y = slotTopY - 2*r (draw cutoff).
  // We scale finalDx via smoothstep so x = slot centre at that exact point.
  const PHASE3_TIME_SCALE = 1.3; // slightly slower than inter-peg arcs
  const lastPeg = hitPegs[rows - 1]!;
  const lastDecision = decisions[rows - 1]!;
  const finalArcStart = DET_T_DROP + (rows - 1) * DET_T_ROW;
  const finalDy = maxLandingY - lastPeg.y;

  // Solve -V_BOUNCE*t + 0.5*g_eff*t² = finalDy for t > 0:
  const finalT = (V_BOUNCE + Math.sqrt(V_BOUNCE * V_BOUNCE + 2 * g_eff * finalDy)) / g_eff;

  // t_draw: time when ball reaches draw-cutoff y (maxLandingY - ballRadius).
  const dy_draw = finalDy - ballRadius;
  const t_draw = (V_BOUNCE + Math.sqrt(V_BOUNCE * V_BOUNCE + 2 * g_eff * dy_draw)) / g_eff;

  // Slot centre: half a pegSpacing from the last peg in the last decision direction.
  const slotCentre = lastPeg.x + (lastDecision ? 1 : -1) * (pegSpacing / 2);

  // Smoothstep ease-in-out for horizontal: gentle near peg, gentle near slot.
  const smoothstep = (s: number) => s * s * (3 - 2 * s);
  const fracAtDraw = t_draw / finalT;
  const smoothAtDraw = smoothstep(fracAtDraw);
  const finalDx = smoothAtDraw > 1e-6 ? (slotCentre - lastPeg.x) / smoothAtDraw : slotCentre - lastPeg.x;
  const targetXRaw = lastPeg.x + finalDx;
  const targetX = clampXToSlot(targetXRaw);
  const phase3SimDuration = finalT * PHASE3_TIME_SCALE;

  // Remember where Phase 3 starts so the peg-pushout below skips these positions
  // (Phase 3's upward arc naturally stays above the last peg).
  const phase3StartIdx = positions.length;
  for (let i = 1; i <= DET_FINE_STEPS; i++) {
    const frac = i / DET_FINE_STEPS;
    const tPhys = frac * finalT;
    const rawX = lastPeg.x + finalDx * smoothstep(frac);
    const y = Math.min(lastPeg.y - V_BOUNCE * tPhys + 0.5 * g_eff * tPhys * tPhys, maxDisplayY);
    positions.push({
      simTime: finalArcStart + frac * phase3SimDuration,
      x: clampXToSlot(rawX),
      y,
    });
  }

  const totalSimTime = finalArcStart + phase3SimDuration;
  positions[positions.length - 1] = { simTime: totalSimTime, x: targetX, y: maxLandingY };

  // Nudge Phase 1+2 positions that land inside a peg's collision circle out to
  // the rim so the debug overlay shows clean bounces off the peg surface.
  // Phase 3 positions are excluded: their upward arc stays above the last peg.
  const pegRadius = PEG_COLLISION_R;
  for (const peg of hitPegs) {
    for (let i = 0; i < phase3StartIdx; i++) {
      const p = positions[i]!;
      const dx = p.x - peg.x;
      const dy = p.y - peg.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < pegRadius) {
        const scale = pegRadius / dist;
        positions[i] = { simTime: p.simTime, x: peg.x + dx * scale, y: peg.y + dy * scale };
      }
    }
  }

  return { positions, pegHits, totalSimTime, finalX: targetX, finalY: maxLandingY };
}

function runRecordSync(rows: number, slotIndex: number, ballRadius: number): RecordedPath {
  return buildDeterministicPath(rows, slotIndex, ballRadius);
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
