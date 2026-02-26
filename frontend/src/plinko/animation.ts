/**
 * Deterministic path for ball animation. Path is computed from server outcome (slotIndex)
 * only — no client-side RNG. Used purely for visual; outcome is already fixed by server.
 */

const BOARD_WIDTH = 320;

export interface PathPoint {
  x: number;
  y: number;
  rowIndex: number; // 0..rows-1 for peg rows, rows for slot
}

/**
 * Generate a path from top center to the given slot index.
 * Rows and slotIndex come from server; path is deterministic from these.
 */
export function getPath(rows: number, slotIndex: number): PathPoint[] {
  const slots = rows + 1;
  const slotWidth = BOARD_WIDTH / slots;
  const rowHeight = slotWidth * 0.85;
  const startY = 24;

  const startCol = Math.floor(rows / 2);
  const endCol = slotIndex;
  const pathCols: number[] = [startCol];
  for (let r = 0; r < rows; r++) {
    const t = (r + 1) / rows;
    const col = Math.round(startCol + (endCol - startCol) * t);
    pathCols.push(Math.max(0, Math.min(r, col)));
  }
  pathCols[pathCols.length - 1] = endCol;

  const points: PathPoint[] = [];
  for (let r = 0; r <= rows; r++) {
    const col = r < pathCols.length ? pathCols[r] : endCol;
    const count = r + 1;
    const x = (BOARD_WIDTH - (count - 1) * slotWidth) / 2 + (col + 0.5) * slotWidth;
    const y = startY + r * rowHeight;
    points.push({ x, y, rowIndex: r });
  }
  const slotY = startY + rows * rowHeight + 12;
  points.push({
    x: slotIndex * slotWidth + slotWidth / 2,
    y: slotY,
    rowIndex: rows,
  });
  return points;
}

/**
 * Interpolate path with easing for smooth animation. Returns (x,y) at progress [0,1].
 */
export function interpolatePath(
  path: PathPoint[],
  progress: number
): { x: number; y: number } {
  if (path.length === 0) return { x: 0, y: 0 };
  if (progress >= 1) return { x: path[path.length - 1].x, y: path[path.length - 1].y };
  const seg = progress * (path.length - 1);
  const i = Math.floor(seg);
  const t = seg - i;
  const a = path[Math.min(i, path.length - 1)];
  const b = path[Math.min(i + 1, path.length - 1)];
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}
