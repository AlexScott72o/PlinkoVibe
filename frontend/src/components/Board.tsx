import { useMemo, useState, useEffect } from 'react';
import type { RiskLevel } from 'shared';
import { Ball } from './Ball';

const PEG_R = 6;
const SLOT_HEIGHT = 36;
const BALL_ANIMATION_MS = 2200;

interface BoardProps {
  rows: number;
  riskLevel: RiskLevel;
  paytables: Record<string, number[]>;
  resultSlotIndex: number | null; // Only set from server bet response
  onPegHit?: (rowIndex: number) => void;
  onLand?: () => void;
}

export function Board({ rows, riskLevel, paytables, resultSlotIndex, onPegHit, onLand }: BoardProps) {
  const [showBall, setShowBall] = useState(false);

  useEffect(() => {
    if (resultSlotIndex === null) return;
    setShowBall(true);
    const t = setTimeout(() => setShowBall(false), BALL_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [resultSlotIndex]);

  const key = `${rows}_${riskLevel}`;
  const multipliers = paytables[key] ?? [];

  const { pegPositions, slotWidth } = useMemo(() => {
    const slots = rows + 1;
    const w = 320;
    const slotWidth = w / slots;
    const positions: { x: number; y: number }[] = [];
    let y = 24;
    for (let r = 0; r < rows; r++) {
      const count = r + 1;
      const startX = (w - (count - 1) * slotWidth) / 2 + slotWidth / 2;
      for (let i = 0; i < count; i++) {
        positions.push({ x: startX + i * slotWidth, y });
      }
      y += slotWidth * 0.85;
    }
    return { pegPositions: positions, slotWidth };
  }, [rows]);

  return (
    <div className="board-wrap">
      <svg
        viewBox={`0 0 320 ${pegPositions.length ? pegPositions[pegPositions.length - 1].y + SLOT_HEIGHT + 40 : 200}`}
        className="board-svg"
        preserveAspectRatio="xMidYMin meet"
      >
        {pegPositions.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={PEG_R}
            className="peg"
          />
        ))}
        {showBall && resultSlotIndex !== null && (
          <Ball
            rows={rows}
            slotIndex={resultSlotIndex}
            onPegHit={onPegHit}
            onLand={onLand}
          />
        )}
        {/* Slots */}
        {multipliers.length > 0 && (
          <g transform={`translate(0, ${pegPositions.length ? pegPositions[pegPositions.length - 1].y + 24 : 80})`}>
            {multipliers.map((mult, i) => {
              const tier = mult >= 5 ? 'high' : mult >= 1.5 ? 'mid' : 'low';
              return (
              <g key={i}>
                <rect
                  x={i * slotWidth + 2}
                  y={0}
                  width={slotWidth - 4}
                  height={SLOT_HEIGHT}
                  className={`slot slot-${tier} ${resultSlotIndex === i ? 'slot-result' : ''}`}
                />
                <text
                  x={i * slotWidth + slotWidth / 2}
                  y={SLOT_HEIGHT / 2 + 4}
                  textAnchor="middle"
                  className="slot-text"
                >
                  {mult}x
                </text>
              </g>
            );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
