/**
 * Shared board layout constants and helpers for all physics engines.
 */

export const BOARD_WIDTH = 320;
export const BOUNDS_MARGIN = 6;
export const PEG_COLLISION_R = 2.16; /* 20% larger than 1.8 */
export const DROP_X = BOARD_WIDTH / 2;
export const DROP_Y = 24 - 28;
export const DROP_X_OFFSET_MAX_PX = 10;
export const LANDED_VY_THRESHOLD = 3;
export const MIN_SIM_MS = 8000;
export const MAX_PHYSICS_MS = 25000;

export const ROW_HEIGHT_FACTOR = 0.78;
/** So that no vertical line misses all pegs: pegSpacing <= 2*(PEG_COLLISION_R + ballRadius). */
export const PEG_SPACING_FACTOR = 0.86;

export function getPegPositions(rows: number): { x: number; y: number; rowIndex: number }[] {
  const slots = rows + 1;
  const slotWidth = BOARD_WIDTH / slots;
  const rowHeight = slotWidth * ROW_HEIGHT_FACTOR;
  const pegSpacing = slotWidth * PEG_SPACING_FACTOR;
  const startY = 24;
  const out: { x: number; y: number; rowIndex: number }[] = [];
  let y = startY;
  for (let r = 0; r < rows; r++) {
    const count = r + 1;
    const startX = (BOARD_WIDTH - (count - 1) * pegSpacing) / 2;
    for (let i = 0; i < count; i++) {
      out.push({ x: startX + i * pegSpacing, y, rowIndex: r });
    }
    y += rowHeight;
  }
  return out;
}

/** Slots aligned with gaps between pegs: uniform width = pegSpacing (a little less than full span). No overlap, no gaps. */
export function getSlotXBounds(rows: number, slotIndex: number): { left: number; right: number } {
  const slots = rows + 1;
  const nominalSlotWidth = BOARD_WIDTH / slots;
  const pegSpacing = nominalSlotWidth * PEG_SPACING_FACTOR;
  const startX = (BOARD_WIDTH - (rows - 1) * pegSpacing) / 2;
  return {
    left: startX + (slotIndex - 1) * pegSpacing,
    right: startX + slotIndex * pegSpacing,
  };
}

export function getTargetSlotX(rows: number, slotIndex: number): number {
  const { left, right } = getSlotXBounds(rows, slotIndex);
  return (left + right) / 2;
}

export function getSlotY(rows: number): number {
  const slots = rows + 1;
  const slotWidth = BOARD_WIDTH / slots;
  const rowHeight = slotWidth * ROW_HEIGHT_FACTOR;
  return 24 + rows * rowHeight + 12;
}

/** Vertical coordinate of the bottom of the slot row (must match Board SLOT_HEIGHT). */
export const SLOT_ROW_HEIGHT = 36;

export function getSlotBottom(rows: number): number {
  return getSlotY(rows) + SLOT_ROW_HEIGHT / 2;
}

export function getSlotCenter(rows: number, slotIndex: number): { x: number; y: number } {
  return { x: getTargetSlotX(rows, slotIndex), y: getSlotY(rows) };
}

/** Ball radius used by UI and physics; must match Ball.tsx. */
export function getBallRadiusForRows(rows: number): number {
  const slotWidth = BOARD_WIDTH / (rows + 1);
  const size = slotWidth * 0.5 * 0.8 * 0.75;
  const clamped = Math.max(5, Math.min(size, 18));
  return clamped / 2;
}
