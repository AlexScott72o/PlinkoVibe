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
  MIN_SIM_MS,
  MAX_PHYSICS_MS,
  getPegPositions,
  getTargetSlotX,
  getSlotY,
  getSlotXBounds,
} from './boardLayout';

export { getSlotXBounds, getSlotCenter } from './boardLayout';

const UPDATES_PER_FRAME = 3;
const STEP_MS = 12;

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
    positionIterations: 12,
    velocityIterations: 8,
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

/** Run Matter.js live (energetic). */
export function runMatterLive(
  rows: number,
  slotIndex: number,
  ballRadius: number,
  initialDropX: number,
  durationMs: number,
  onPosition: (x: number, y: number) => void,
  onPegHit: (rowIndex: number) => void,
  onLand: () => void,
  onComplete: () => void
): PhysicsRunResult {
  const pegPositions = getPegPositions(rows);
  const targetX = getTargetSlotX(rows, slotIndex);
  const slotY = getSlotY(rows);
  const { left: slotLeft, right: slotRight } = getSlotXBounds(rows, slotIndex);
  const pegHit = new Set<number>();

  const engine = Matter.Engine.create({
    gravity: { x: 0, y: GRAVITY_Y },
    positionIterations: 12,
    velocityIterations: 8,
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
    (body as Matter.Body & { _rowIndex?: number })._rowIndex = p.rowIndex;
    pegBodies.push(body);
    Matter.World.add(world, body);
  });
  Matter.World.add(world, ball);

  let rafId = 0;
  const startTime = performance.now();
  const minX = ballRadius + BOUNDS_MARGIN;
  const maxX = BOARD_WIDTH - ballRadius - BOUNDS_MARGIN;

  const tick = () => {
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
    const vy = ball.velocity.y;
    const elapsed = performance.now() - startTime;

    pegBodies.forEach((peg) => {
      const rowIndex = (peg as Matter.Body & { _rowIndex?: number })._rowIndex ?? 0;
      const dist = Math.hypot(peg.position.x - px, peg.position.y - py);
      if (dist < PEG_COLLISION_R + ballRadius + 1 && !pegHit.has(rowIndex)) {
        pegHit.add(rowIndex);
        onPegHit(rowIndex);
      }
    });

    const landed = py >= slotY - 10 && Math.abs(vy) < LANDED_VY_THRESHOLD;
    const simTimeoutMs = Math.min(Math.max(durationMs * 1.5, MIN_SIM_MS), MAX_PHYSICS_MS);
    const timedOut = elapsed >= simTimeoutMs;
    if (landed || timedOut) {
      let finalX = px;
      if (px < slotLeft || px > slotRight) finalX = targetX;
      const finalY = py >= slotY - 10 ? ball.position.y : slotY;
      Matter.Body.setPosition(ball, { x: finalX, y: finalY });
      Matter.Body.setVelocity(ball, { x: 0, y: 0 });
      onPosition(finalX, finalY);
      onLand();
      onComplete();
      return;
    }
    onPosition(px, py);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
  return {
    stop: () => {
      cancelAnimationFrame(rafId);
      Matter.World.remove(world, ball);
      pegBodies.forEach((b) => Matter.World.remove(world, b));
    },
  };
}
