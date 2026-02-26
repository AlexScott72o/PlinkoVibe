import { useEffect, useState, useRef } from 'react';
import { getPath, interpolatePath, type PathPoint } from '@/plinko/animation';

const DURATION_MS = 2200;
const EASE = (t: number) => t * (2 - t); // ease-out quadratic

interface BallProps {
  rows: number;
  slotIndex: number;
  onPegHit?: (rowIndex: number) => void;
  onLand?: () => void;
  onComplete?: () => void;
}

export function Ball({ rows, slotIndex, onPegHit, onLand, onComplete }: BallProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const pathRef = useRef<PathPoint[]>([]);
  const startRef = useRef<number>(0);
  const pegHitRef = useRef<Set<number>>(new Set());
  const rafRef = useRef<number>(0);

  useEffect(() => {
    pathRef.current = getPath(rows, slotIndex);
    startRef.current = performance.now();
    pegHitRef.current = new Set();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(1, elapsed / DURATION_MS);
      const eased = EASE(progress);

      const pos = interpolatePath(pathRef.current, eased);
      setPosition(pos);

      const pathLen = pathRef.current.length - 1;
      for (let r = 0; r < rows; r++) {
        const threshold = (r + 1) / pathLen;
        if (eased >= threshold && !pegHitRef.current.has(r)) {
          pegHitRef.current.add(r);
          onPegHit?.(r);
        }
      }
      if (eased >= 0.98 && !pegHitRef.current.has(-1)) {
        pegHitRef.current.add(-1);
        onLand?.();
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [rows, slotIndex, onPegHit, onLand, onComplete]);

  if (position === null) return null;

  const size = 24;
  const x = position.x - size / 2;
  const y = position.y - size / 2;

  return (
    <g className="ball-wrap">
      <image
        href="/plinko-ball.png"
        x={x}
        y={y}
        width={size}
        height={size}
        className="ball-img"
      />
    </g>
  );
}
