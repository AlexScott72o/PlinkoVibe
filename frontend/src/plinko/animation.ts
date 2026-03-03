/**
 * Deterministic path for ball animation. Path is computed from server outcome (slotIndex)
 * only — no client-side RNG. Used purely for visual; outcome is already fixed by server.
 *
 * Path uses bounce points (tangent to each peg) plus via points in the gap between
 * consecutive pegs, so every segment stays strictly outside all peg circles.
 */

const BOARD_WIDTH = 320;
const PEG_R = 1.5; /* 75% smaller than original 6; must match Board peg radius */

export interface PathPoint {
  x: number;
  y: number;
  rowIndex: number;
}

function normalize(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 0, y: 1 };
  return { x: dx / len, y: dy / len };
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
  const d = PEG_R + ballRadius;
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
    };
    target = bouncePts[r];
  }

  const points: PathPoint[] = [];
  points.push({ x: BOARD_WIDTH / 2, y: startY, rowIndex: 0 });

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
  return points.filter((p): p is PathPoint => p != null && typeof p.x === 'number' && typeof p.y === 'number');
}

/** Ease-in-out: slow at segment ends (bounce points), faster in middle. */
function segmentEase(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Interpolate along the path with straight segments only (no curve).
 * So the ball never enters peg circles: it moves in lines between tangent points.
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

  const segProgress = progress * numSegments;
  const segIndex = Math.min(Math.floor(segProgress), numSegments - 1);
  const t = segProgress - segIndex;
  const easedT = segmentEase(t);

  const p0 = path[segIndex];
  const p1 = path[segIndex + 1];
  if (!p0 || !p1) return last ? { x: last.x, y: last.y } : { x: 0, y: 0 };
  return {
    x: p0.x + (p1.x - p0.x) * easedT,
    y: p0.y + (p1.y - p0.y) * easedT,
  };
}
