import { useEffect, useState, useRef } from 'react';
import { getPath, interpolatePath, type PathPoint } from '@/plinko/animation';

const BOARD_WIDTH = 320;
const EASE = (t: number) => t * (2 - t); // ease-out quadratic

/** Ball diameter so it stays smaller than the gap between pegs in any row config. */
function ballSizeForRows(rows: number): number {
  const slotWidth = BOARD_WIDTH / (rows + 1);
  const size = slotWidth * 0.5 * 0.8 * 0.75; // 25% smaller
  return Math.max(5, Math.min(size, 18));
}

interface BallProps {
  rows: number;
  slotIndex: number;
  durationMs: number;
  onPegHit?: (rowIndex: number) => void;
  onLand?: () => void;
  onComplete?: () => void;
}

export function Ball({ rows, slotIndex, durationMs, onPegHit, onLand, onComplete }: BallProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const pathRef = useRef<PathPoint[]>([]);
  const startRef = useRef<number>(0);
  const durationRef = useRef(durationMs);
  const hasPaintedAtStartRef = useRef(false);
  const pegHitRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number>(0);
  const onPegHitRef = useRef(onPegHit);
  const onLandRef = useRef(onLand);
  const onCompleteRef = useRef(onComplete);
  onPegHitRef.current = onPegHit;
  onLandRef.current = onLand;
  onCompleteRef.current = onComplete;

  const ballRadius = ballSizeForRows(rows) / 2;
  useEffect(() => {
    pathRef.current = getPath(rows, slotIndex, ballRadius);
    startRef.current = performance.now();
    durationRef.current = durationMs;
    hasPaintedAtStartRef.current = false;
    pegHitRef.current = new Set();
    setPosition(null);
    setTrail([]);

    const tick = (now: number) => {
      const path = pathRef.current;
      if (!path?.length) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - startRef.current;
      const duration = Math.max(durationRef.current, 1);
      const progress = Math.min(1, elapsed / duration);
      const eased = EASE(progress);

      let pos: { x: number; y: number };
      try {
        if (!hasPaintedAtStartRef.current) {
          pos = interpolatePath(path, 0);
          hasPaintedAtStartRef.current = true;
        } else {
          pos = interpolatePath(path, eased);
        }
      } catch {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      setPosition(pos);
      setTrail((prev) => {
        const newTrail = [...prev, pos];
        if (newTrail.length > 8) newTrail.shift();
        return newTrail;
      });

      const pathLen = pathRef.current.length - 1;
      for (let r = 0; r < rows; r++) {
        const threshold = (2 * r + 1) / pathLen;
        if (eased >= threshold && !pegHitRef.current.has(r)) {
          pegHitRef.current.add(r);
          onPegHitRef.current?.(r);
        }
      }
      if (eased >= 0.98 && !pegHitRef.current.has(-1)) {
        pegHitRef.current.add(-1);
        onLandRef.current?.();
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onCompleteRef.current?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rows, slotIndex, ballRadius]);

  if (position === null) return null;

  const size = ballSizeForRows(rows);
  const r = size / 2;
  const cx = position.x;
  const cy = position.y;

  return (
    <g className="ball-wrap">
      <defs>
        <radialGradient id="ball-glow" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="50%" stopColor="#00E5FF" stopOpacity="0.95" />
          <stop offset="85%" stopColor="#7000FF" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0B0D17" stopOpacity="0.4" />
        </radialGradient>
        <filter id="ball-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00E5FF" floodOpacity="0.6" />
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      {trail.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={Math.max(r - 1, 2)}
          fill="rgba(0, 229, 255, 0.4)"
          opacity={(i + 1) / trail.length}
          filter="blur(1px)"
        />
      ))}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="url(#ball-glow)"
        filter="url(#ball-shadow)"
        className="ball-img"
      />
    </g>
  );
}
