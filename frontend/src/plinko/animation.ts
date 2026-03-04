/**
 * Ball animation: deterministic path from server outcome (slotIndex).
 *
 * Approach:
 * - Path is a sequence of waypoints that go *around* pegs (never over). Bounce
 *   points are tangent to pegs with clearance; via points sit in the gap between
 *   pegs; initial approach uses side waypoints so the drop never crosses the top peg.
 * - Motion is smooth interpolation along these waypoints (smoothstep per segment)
 *   so the ball decelerates into each peg and accelerates out, with no separate
 *   bounce overlay. Single, consistent motion along a safe path.
 */

const BOARD_WIDTH = 320;
const PEG_R = 2.16; /* align with boardLayout PEG_COLLISION_R */
const DROP_START_OFFSET = 28; /* ball appears and starts above the top peg */
const PATH_CLEARANCE = 4; /* min distance from peg so ball graphic never overlaps */

export interface PathPoint {
  x: number;
  y: number;
  rowIndex: number;
  /** Outward normal from peg at bounce (so ball bounces away, never overlaps). */
  bounceNormal?: { x: number; y: number };
}

function normalize(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 1 };
  return { x: dx / len, y: dy / len };
}

/** All peg centers for the board (used to clamp ball outside pegs). */
export function getPegCenters(rows: number): { x: number; y: number }[] {
  const slots = rows + 1;
  const slotWidth = BOARD_WIDTH / slots;
  const rowHeight = slotWidth * 0.85;
  const startY = 24;
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const count = r + 1;
    for (let c = 0; c < count; c++) {
      out.push(pegPosition(r, c, slotWidth, rowHeight, startY));
    }
  }
  return out;
}

/**
 * Peg center position for row r, column col (0..r). Must match Board layout exactly.
 */
function pegPosition(
  row: number,
  col: number,
  slotWidth: number,
  rowHeight: number,
  startY: number
): { x: number; y: number } {
  const count = row + 1;
  const startX = (BOARD_WIDTH - (count - 1) * slotWidth) / 2;
  return {
    x: startX + col * slotWidth,
    y: startY + row * rowHeight,
  };
}

/**
 * Point that is exactly R from both A and B (one of the two circle-circle intersections).
 * Chooses the intersection with larger y so the path goes downward.
 */
function circleCircleVia(A: { x: number; y: number }, B: { x: number; y: number }, R: number): { x: number; y: number } {
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= 2 * R || dist < 1e-6) {
    return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  }
  const midX = (A.x + B.x) / 2;
  const midY = (A.y + B.y) / 2;
  const h = Math.sqrt(R * R - (dist / 2) * (dist / 2));
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const via1 = { x: midX + h * perpX, y: midY + h * perpY };
  const via2 = { x: midX - h * perpX, y: midY - h * perpY };
  return via1.y >= via2.y ? via1 : via2;
}

/**
 * Generate a path from top center to the slot. Inserts via points between each pair
 * of bounce points so segments never enter peg circles (ball goes around pegs).
 */
export function getPath(rows: number, slotIndex: number, ballRadius: number): PathPoint[] {
  const slots = rows + 1;
  const slotWidth = BOARD_WIDTH / slots;
  const rowHeight = slotWidth * 0.85;
  const startY = 24;
  const d = PEG_R + ballRadius + PATH_CLEARANCE;
  const R = d + 4;

  const startCol = Math.floor(rows / 2);
  const endCol = slotIndex;
  // Row 0 has only one peg (column 0). Interpolate from center peg toward target slot.
  const pathCols: number[] = [0];
  for (let r = 0; r < rows; r++) {
    const t = (r + 1) / rows;
    const col = Math.round(startCol + (endCol - startCol) * t);
    pathCols.push(Math.max(0, Math.min(r + 1, col)));
  }
  pathCols[pathCols.length - 1] = endCol;

  const slotY = startY + rows * rowHeight + 12;
  const slotCenter = { x: (slotIndex + 0.5) * slotWidth, y: slotY };

  const bouncePts: PathPoint[] = [];
  let target: { x: number; y: number } = slotCenter;

  for (let r = rows - 1; r >= 0; r--) {
    const peg = pegPosition(r, pathCols[r], slotWidth, rowHeight, startY);
    const dx = target.x - peg.x;
    const dy = target.y - peg.y;
    const n = normalize(dx, dy);
    bouncePts[r] = {
      x: peg.x + d * n.x,
      y: peg.y + d * n.y,
      rowIndex: r,
      bounceNormal: n,
    };
    target = bouncePts[r];
  }

  const points: PathPoint[] = [];
  const centerX = BOARD_WIDTH / 2;
  points.push({ x: centerX, y: startY - DROP_START_OFFSET, rowIndex: 0 });

  // Approach first peg from the side so the ball never passes over the peg.
  const peg0 = pegPosition(0, pathCols[0], slotWidth, rowHeight, startY);
  const n0 = bouncePts[0].bounceNormal!;
  const side = Math.abs(n0.x) > 0.05 ? n0.x : 1;
  const margin = d + 3;
  points.push({
    x: centerX + margin * side,
    y: startY - 6,
    rowIndex: 0,
  });
  points.push({
    x: peg0.x + (d + 2) * n0.x,
    y: startY - 2,
    rowIndex: 0,
  });
  points.push({
    x: peg0.x + (d + 2) * n0.x,
    y: peg0.y + (d + 2) * n0.y,
    rowIndex: 0,
  });

  for (let r = 0; r < rows; r++) {
    points.push(bouncePts[r]);
    if (r < rows - 1) {
      const pegA = pegPosition(r, pathCols[r], slotWidth, rowHeight, startY);
      const pegB = pegPosition(r + 1, pathCols[r + 1], slotWidth, rowHeight, startY);
      const via = circleCircleVia(pegA, pegB, R);
      points.push({ x: via.x, y: via.y, rowIndex: r });
    }
  }
  points.push({ x: slotCenter.x, y: slotCenter.y, rowIndex: rows });

  const minDist = d;
  const pegCenters: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    pegCenters.push(pegPosition(r, pathCols[r], slotWidth, rowHeight, startY));
  }

  const maxSubdiv = 50;
  let inserted = true;
  let iterations = 0;
  while (inserted && iterations < maxSubdiv) {
    inserted = false;
    iterations++;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      if (!p0 || !p1) continue;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;

      for (const peg of pegCenters) {
        const toP0 = p0.x - peg.x;
        const toP0y = p0.y - peg.y;
        const t = Math.max(0, Math.min(1, -(toP0 * dx + toP0y * dy) / (len * len)));
        const closestX = p0.x + t * dx;
        const closestY = p0.y + t * dy;
        const dist = Math.hypot(closestX - peg.x, closestY - peg.y);
        if (dist < minDist && dist > 1e-6) {
          const out = (minDist + 1 - dist) / dist;
          const mid: PathPoint = {
            x: closestX + (closestX - peg.x) * out,
            y: closestY + (closestY - peg.y) * out,
            rowIndex: p0.rowIndex,
          };
          points.splice(i + 1, 0, mid);
          inserted = true;
          break;
        }
      }
      if (inserted) break;
    }
  }

  return points.filter((p): p is PathPoint => p != null && typeof p.x === 'number' && typeof p.y === 'number');
}

/** Push position outward from any peg so the ball never overlaps. */
export function clampPositionOutsidePegs(
  pos: { x: number; y: number },
  pegCenters: { x: number; y: number }[],
  pegR: number,
  ballRadius: number
): { x: number; y: number } {
  const minDist = pegR + ballRadius + 0.5;
  let x = pos.x;
  let y = pos.y;
  for (const peg of pegCenters) {
    const dx = x - peg.x;
    const dy = y - peg.y;
    const dist = Math.hypot(dx, dy);
    if (dist < minDist && dist > 1e-6) {
      const scale = minDist / dist;
      x = peg.x + dx * scale;
      y = peg.y + dy * scale;
    }
  }
  return { x, y };
}

/** Smoothstep: slow at segment ends (at pegs), faster in middle — mimics contact. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Interpolate along the path by arc length so progress is proportional to distance.
 * Avoids pauses when subdivision creates many short segments (e.g. after the first peg).
 */
export function interpolatePath(
  path: PathPoint[],
  progress: number
): { x: number; y: number } {
  if (!path?.length) return { x: 0, y: 0 };
  const last = path[path.length - 1];
  if (!last || progress >= 1) return last ? { x: last.x, y: last.y } : { x: 0, y: 0 };

  const numSegments = path.length - 1;
  if (numSegments <= 0) return last ? { x: last.x, y: last.y } : { x: 0, y: 0 };

  const lengths: number[] = [0];
  for (let i = 0; i < numSegments; i++) {
    const p0 = path[i];
    const p1 = path[i + 1];
    const segLen = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : 0;
    lengths.push(lengths[lengths.length - 1] + segLen);
  }
  const totalLen = lengths[lengths.length - 1];
  if (totalLen < 1e-9) return last ? { x: last.x, y: last.y } : { x: 0, y: 0 };

  const target = progress * totalLen;
  let segIndex = 0;
  while (segIndex < numSegments - 1 && lengths[segIndex + 1] <= target) segIndex++;
  const segStart = lengths[segIndex];
  const segEnd = lengths[segIndex + 1];
  const segLen = segEnd - segStart;
  const t = segLen < 1e-9 ? 1 : (target - segStart) / segLen;
  const s = smoothstep(Math.max(0, Math.min(1, t)));

  const p0 = path[segIndex];
  const p1 = path[segIndex + 1];
  if (!p0 || !p1) return last ? { x: last.x, y: last.y } : { x: 0, y: 0 };

  return {
    x: p0.x + (p1.x - p0.x) * s,
    y: p0.y + (p1.y - p0.y) * s,
  };
}
