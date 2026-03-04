import { useEffect, useState, useRef } from 'react';
import { getInitialDropXMatter, runMatterLive } from '@/plinko/physicsSim';

const BOARD_WIDTH = 320;

function ballSizeForRows(rows: number): number {
  const slotWidth = BOARD_WIDTH / (rows + 1);
  const size = slotWidth * 0.5 * 0.8 * 0.75;
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

export function Ball({
  rows,
  slotIndex,
  durationMs,
  onPegHit,
  onLand,
  onComplete,
}: BallProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const pegHitRef = useRef<Set<number>>(new Set());
  const onPegHitRef = useRef(onPegHit);
  const onLandRef = useRef(onLand);
  const onCompleteRef = useRef(onComplete);
  onPegHitRef.current = onPegHit;
  onLandRef.current = onLand;
  onCompleteRef.current = onComplete;

  const ballRadius = ballSizeForRows(rows) / 2;

  useEffect(() => {
    pegHitRef.current = new Set();
    setPosition(null);
    setTrail([]);

    const onPos = (px: number, py: number) => {
      setPosition({ x: px, y: py });
      setTrail((prev) => {
        const next = [...prev, { x: px, y: py }];
        if (next.length > 8) next.shift();
        return next;
      });
    };
    const onHit = (rowIndex: number) => onPegHitRef.current?.(rowIndex);
    const onL = () => onLandRef.current?.();
    const onC = () => onCompleteRef.current?.();

    const runResult = runMatterLive(rows, slotIndex, ballRadius, getInitialDropXMatter(rows, slotIndex, ballRadius), durationMs, onPos, onHit, onL, onC);
    return () => runResult.stop();
  }, [rows, slotIndex, ballRadius, durationMs]);

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
