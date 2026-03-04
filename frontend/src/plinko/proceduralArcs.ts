/**
 * Procedural ball animation: parabolic arcs under gravity with bounce reflections.
 * Uses the same path geometry as getPath but moves along it with gravity + bounce.
 */

const GRAVITY = 0.5; // px/ms^2

export interface ArcSegment {
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
  durationMs: number;
  durationPhysicsMs: number;
  rowIndex: number;
  bounceNormal?: { x: number; y: number };
}

function reflect(vx: number, vy: number, n: { x: number; y: number }): { vx: number; vy: number } {
  const dot = vx * n.x + vy * n.y;
  return {
    vx: vx - 2 * dot * n.x,
    vy: vy - 2 * dot * n.y,
  };
}

/**
 * Build parabolic arc segments from path points. Path must include bounce points with normals.
 * Total duration is scaled to targetDurationMs.
 */
export function getArcSegments(
  path: { x: number; y: number; rowIndex: number; bounceNormal?: { x: number; y: number } }[],
  targetDurationMs: number
): ArcSegment[] {
  if (!path || path.length < 2) return [];

  const segments: ArcSegment[] = [];
  const g = GRAVITY;

  const p0 = path[0]!;
  const p1 = path[1]!;
  const dy0 = p1.y - p0.y;
  const dx0 = p1.x - p0.x;
  if (dy0 <= 0) return [];

  const T0 = Math.sqrt((2 * dy0) / g);
  const vx0 = dx0 / T0;

  segments.push({
    x0: p0.x,
    y0: p0.y,
    vx0,
    vy0: 0,
    durationMs: T0,
    durationPhysicsMs: T0,
    rowIndex: p0.rowIndex,
    bounceNormal: p1.bounceNormal,
  });

  let vx = vx0;
  let vy = g * T0;
  let totalPhysics = T0;

  for (let i = 1; i < path.length - 1; i++) {
    const start = path[i]!;
    const end = path[i + 1]!;
    const n = start.bounceNormal;
    if (n) {
      const reflected = reflect(vx, vy, n);
      vx = reflected.vx;
      vy = reflected.vy;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let T = 0;
    if (Math.abs(vx) > 1e-6) {
      T = dx / vx;
    } else {
      T = Math.sqrt((2 * Math.abs(dy)) / g);
    }
    if (T < 1) T = 1;

    segments.push({
      x0: start.x,
      y0: start.y,
      vx0: vx,
      vy0: vy,
      durationMs: T,
      durationPhysicsMs: T,
      rowIndex: start.rowIndex,
      bounceNormal: end.bounceNormal,
    });

    vy = vy + g * T;
    totalPhysics += T;
  }

  const scale = targetDurationMs / totalPhysics;
  segments.forEach((seg) => {
    seg.durationMs = seg.durationPhysicsMs * scale;
  });

  return segments;
}

/**
 * Position at time t (ms) within a segment. tMs is in scaled time (0..segment.durationMs).
 */
export function positionInSegment(
  seg: ArcSegment,
  tMs: number
): { x: number; y: number } {
  if (seg.durationMs <= 0) return { x: seg.x0, y: seg.y0 };
  const g = GRAVITY;
  const t = Math.max(0, Math.min(seg.durationPhysicsMs, (tMs / seg.durationMs) * seg.durationPhysicsMs));
  const x = seg.x0 + seg.vx0 * t;
  const y = seg.y0 + seg.vy0 * t + 0.5 * g * t * t;
  return { x: Number.isFinite(x) ? x : seg.x0, y: Number.isFinite(y) ? y : seg.y0 };
}

/**
 * Map global elapsed ms to segment index and local t. Segments are concatenated in time.
 * elapsedMs is clamped to [0, totalDuration].
 */
export function getSegmentAtTime(
  segments: ArcSegment[],
  elapsedMs: number
): { segmentIndex: number; localMs: number } | null {
  if (!segments.length) return null;
  const total = segments.reduce((s, seg) => s + seg.durationMs, 0);
  const clamped = Math.max(0, Math.min(elapsedMs, total));
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const d = segments[i]!.durationMs;
    if (clamped <= acc + d) {
      return { segmentIndex: i, localMs: clamped - acc };
    }
    acc += d;
  }
  const last = segments[segments.length - 1]!;
  return { segmentIndex: segments.length - 1, localMs: last.durationMs };
}
