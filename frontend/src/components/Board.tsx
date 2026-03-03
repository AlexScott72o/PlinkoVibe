import { useMemo, useState, useCallback, useEffect } from 'react';
import type { RiskLevel } from 'shared';
import type { ActiveBall } from '@/hooks/usePlinko';
import { Ball } from './Ball';

const PEG_R = 1.5; /* 75% smaller than original 6 */
const SLOT_HEIGHT = 36;

interface BoardProps {
  rows: number;
  riskLevel: RiskLevel;
  paytables: Record<string, number[]>;
  activeBalls: ActiveBall[];
  animationDurationMs: number;
  onBallComplete: (roundId: number) => void;
  onPegHit?: (rowIndex: number) => void;
  onLand?: () => void;
}

export function Board({ rows, riskLevel, paytables, activeBalls, animationDurationMs, onBallComplete, onPegHit, onLand }: BoardProps) {
  const [landedRoundIds, setLandedRoundIds] = useState<Set<number>>(new Set());
  const [activePegs, setActivePegs] = useState<number[]>([]);

  const handlePegHit = useCallback((rowIndex: number) => {
    setActivePegs((prev) => [...prev, rowIndex]);
    onPegHit?.(rowIndex);
  }, [onPegHit]);

  const handleBallLand = useCallback((roundId: number) => {
    setLandedRoundIds((prev) => new Set(prev).add(roundId));
    onLand?.();
  }, [onLand]);

  useEffect(() => {
    setActivePegs([]);
  }, [activeBalls]);

  const key = `${rows}_${riskLevel}`;
  const multipliers = paytables[key] ?? [];

  const { pegPositions, slotWidth, slotGroupY } = useMemo(() => {
    const slots = rows + 1;
    const w = 320;
    const slotWidth = w / slots;
    const rowHeight = slotWidth * 0.85;
    const positions: { x: number; y: number, rowIndex: number }[] = [];
    let y = 24;
    for (let r = 0; r < rows; r++) {
      const count = r + 1;
      const startX = (w - (count - 1) * slotWidth) / 2;
      for (let i = 0; i < count; i++) {
        positions.push({ x: startX + i * slotWidth, y, rowIndex: r });
      }
      y += rowHeight;
    }
    // Align slot row with ball path: ball lands at 24 + rows*rowHeight + 12
    const slotGroupY = 18 + rows * rowHeight;
    return { pegPositions: positions, slotWidth, slotGroupY };
  }, [rows]);

  return (
    <div className="board-wrap">
      <svg
        viewBox={`0 0 320 ${pegPositions.length ? slotGroupY + SLOT_HEIGHT + 40 : 200}`}
        className="board-svg"
        preserveAspectRatio="xMidYMin meet"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="peg-3d" cx="35%" cy="30%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="50%" stopColor="#f0f0f5" stopOpacity="1" />
            <stop offset="85%" stopColor="#c0c0d0" stopOpacity="1" />
            <stop offset="100%" stopColor="#8a8a9a" stopOpacity="1" />
          </radialGradient>
          <radialGradient id="peg-3d-active" cx="33%" cy="27%" r="68%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="45%" stopColor="#f5f5ff" stopOpacity="1" />
            <stop offset="80%" stopColor="#d0d8e8" stopOpacity="1" />
            <stop offset="100%" stopColor="#9aa0b0" stopOpacity="1" />
          </radialGradient>
          <filter id="peg-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="peg-glow-cyan" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feFlood floodColor="#00E5FF" floodOpacity="0.6" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {multipliers.length > 0 && multipliers.map((_, i) => (
            <clipPath key={i} id={`slot-clip-${i}`}>
              <rect x={i * slotWidth + 2} y={0} width={slotWidth - 4} height={SLOT_HEIGHT} rx={4} />
            </clipPath>
          ))}
        </defs>
        {pegPositions.map((p, i) => {
          const isActive = activePegs.includes(p.rowIndex);
          const r = isActive ? PEG_R * 1.15 : PEG_R;
          return (
            <g key={i} transform={`translate(${p.x}, ${p.y})`} style={{ transition: 'filter 0.15s ease-out' }}>
              <circle
                r={r}
                cx={0}
                cy={0}
                fill={`url(#peg-${isActive ? '3d-active' : '3d'})`}
                filter={isActive ? 'url(#peg-glow-cyan)' : 'url(#peg-glow)'}
              />
            </g>
          );
        })}
        {activeBalls.map((ball) => (
          <Ball
            key={ball.roundId}
            rows={ball.rows}
            slotIndex={ball.slotIndex}
            durationMs={animationDurationMs}
            onPegHit={handlePegHit}
            onLand={() => handleBallLand(ball.roundId)}
            onComplete={() => onBallComplete(ball.roundId)}
          />
        ))}
        {/* Slots — positioned so slot center matches ball path end (24 + rows*rowHeight + 12) */}
        {multipliers.length > 0 && (
          <g transform={`translate(0, ${slotGroupY})`}>
            {multipliers.map((mult, i) => {
              const tier = mult >= 5 ? 'high' : mult >= 1.5 ? 'mid' : 'low';
              const showAsResult = activeBalls.some((b) => b.slotIndex === i && landedRoundIds.has(b.roundId));
              const landedClass = showAsResult ? `landed-${tier}` : '';
              const slotX = i * slotWidth + 2;
              const slotW = slotWidth - 4;
              const fontSize = Math.min(10, Math.max(6, slotW / 4));
              return (
              <g key={i}>
                <rect
                  x={slotX}
                  y={0}
                  width={slotW}
                  height={SLOT_HEIGHT}
                  rx={4}
                  className={`slot slot-${tier} ${showAsResult ? 'slot-result' : ''} ${landedClass}`}
                  style={{
                    transition: 'all 0.3s ease',
                    ...(landedClass ? { transformOrigin: '50% 50%' } : {}),
                  }}
                />
                <g clipPath={`url(#slot-clip-${i})`}>
                  <text
                    x={i * slotWidth + slotWidth / 2}
                    y={SLOT_HEIGHT / 2 - 5}
                    textAnchor="middle"
                    className="slot-text"
                    style={{ fontSize }}
                  >
                    <tspan x={i * slotWidth + slotWidth / 2} dy={0}>{String(mult)}</tspan>
                    <tspan x={i * slotWidth + slotWidth / 2} dy={11}>x</tspan>
                  </text>
                </g>
              </g>
            );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
