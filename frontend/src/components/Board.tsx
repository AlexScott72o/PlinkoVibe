import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { RiskLevel } from 'shared';
import type { ActiveBall } from '@/hooks/usePlinko';
import { getPegPositions, getSlotXBounds } from '@/plinko/boardLayout';
import { interpolatePath, type RecordedPath } from '@/plinko/physicsSim';
import { winIntensityFromMultiplier } from '@/plinko/winIntensity';
import { Ball } from './Ball';

const TRAIL_MAX = 6;
const VIEWBOX_Y_OFFSET = 40;
/** Throttle peg-hit state updates to avoid 60+ re-renders/sec during animation */
const PEG_FLUSH_INTERVAL_MS = 80;

export type BallPosition = { x: number; y: number; trail: { x: number; y: number }[] };

type PlaybackEntry = {
  path: RecordedPath;
  slotIndex: number;
  startTime: number;
  durationMs: number;
  pegHitIndex: number;
  radius: number;
  onPegHit: (pegIndex: number) => void;
  onLand: () => void;
  onComplete: () => void;
};

const TRAIL_ABOVE_COUNT = 25;
const TRAIL_REDUCED_MAX = 2;
/** No trails when many balls to keep FPS up */
const TRAIL_OFF_ABOVE_COUNT = 10;
/** Solid fill instead of gradient when many balls */
const SOLID_BALL_ABOVE_COUNT = 12;
const BALL_SOLID_FILL = 'rgba(200, 240, 255, 0.95)';

function getCachedGradient(
  ctx: CanvasRenderingContext2D,
  r: number,
  cache: Map<number, CanvasGradient>
): CanvasGradient {
  const key = Math.round(r * 20) / 20;
  let g = cache.get(key);
  if (!g) {
    g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.08, 0, 0, r);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    g.addColorStop(0.12, 'rgba(220, 248, 255, 0.95)');
    g.addColorStop(0.35, 'rgba(140, 215, 255, 0.95)');
    g.addColorStop(0.6, 'rgba(50, 160, 220, 0.98)');
    g.addColorStop(0.85, 'rgba(20, 100, 180, 0.95)');
    g.addColorStop(1, 'rgba(10, 60, 130, 0.95)');
    cache.set(key, g);
  }
  return g;
}

function drawBalls(
  ctx: CanvasRenderingContext2D,
  positions: Record<number, BallPosition>,
  entries: Map<number, PlaybackEntry>,
  viewBoxHeight: number,
  ballCount: number,
  gradientCache: Map<number, CanvasGradient>,
  slotTopY: number
) {
  const trailMax =
    ballCount >= TRAIL_OFF_ABOVE_COUNT ? 0 : ballCount > TRAIL_ABOVE_COUNT ? TRAIL_REDUCED_MAX : TRAIL_MAX;
  const useSolidFill = ballCount >= SOLID_BALL_ABOVE_COUNT;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, VIEWBOX_Y_OFFSET);
  ctx.clearRect(0, -VIEWBOX_Y_OFFSET, 320, viewBoxHeight);
  ctx.beginPath();
  ctx.rect(0, -VIEWBOX_Y_OFFSET - 1, 322, slotTopY + VIEWBOX_Y_OFFSET + 1);
  ctx.clip();
  entries.forEach((entry, roundId) => {
    const pos = positions[roundId];
    if (!pos) return;
    const { x, y, trail } = pos;
    const r = entry.radius;
    if (y - r >= slotTopY) return;
    /* Stop drawing before ball reaches slot so it never appears in the slot. */
    if (y >= slotTopY - 2 * r) return;
    const maxCenterY = slotTopY - 2 * r;
    const drawY = Math.min(y, maxCenterY);
    const trailLen = trailMax > 0 ? trail.length : 0;
    for (let i = 0; i < trailLen; i++) {
      const p = trail[i];
      const trailR = Math.max(r - 1, 2);
      const trailY = Math.min(p.y, slotTopY - 2 * trailR);
      const alpha = (i + 1) / (trailLen || 1);
      ctx.fillStyle = `rgba(0, 229, 255, ${0.35 * alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, trailY, trailR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.translate(x, drawY);
    ctx.fillStyle = useSolidFill ? BALL_SOLID_FILL : getCachedGradient(ctx, r, gradientCache);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(-x, -drawY);
  });
  ctx.restore();
}

const BOARD_W = 320;
const ROW_HEIGHT_FACTOR = 0.78;
const PEG_R = 2.304; /* 20% larger than 1.92, matches physics scale */
const SLOT_HEIGHT = 36;

interface BoardProps {
  rows: number;
  riskLevel: RiskLevel;
  paytables: Record<string, number[]>;
  activeBalls?: ActiveBall[] | null;
  animationDurationMs: number;
  onBallComplete: (roundId: number) => void;
  onPegHit?: (rowIndex: number) => void;
  onLand?: (roundId: number) => void;
}

export function Board({ rows, riskLevel, paytables, activeBalls = [], animationDurationMs, onBallComplete, onPegHit, onLand }: BoardProps) {
  const balls = activeBalls ?? [];
  const [landedRoundIds, setLandedRoundIds] = useState<Set<number>>(new Set());
  const [activePegs, setActivePegs] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const playbackRef = useRef<Map<number, PlaybackEntry>>(new Map());
  const positionsRef = useRef<Record<number, BallPosition>>({});
  const rafIdRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewBoxHeightRef = useRef(240);
  const slotTopYRef = useRef(0);
  const slotBottomYRef = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const gradientCacheRef = useRef<Map<number, CanvasGradient>>(new Map());
  const activePegsRef = useRef<number[]>([]);
  const fpsNodeRef = useRef<HTMLDivElement>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const fpsLogLastRef = useRef<number>(0);
  const fpsFrameCountRef = useRef<number>(0);
  const fpsAccumRef = useRef<number>(0);
  const fpsUiLastRef = useRef<number>(0);
  // Simulation clock (decoupled from wall time so we can pause/resume cleanly)
  const simNowRef = useRef<number>(0);
  const lastRealNowRef = useRef<number | null>(null);

  const handlePegHit = useCallback((pegIndex: number) => {
    // Briefly light up hit pegs.
    activePegsRef.current.push(pegIndex);
    setActivePegs((prev) => (prev.includes(pegIndex) ? prev : [...prev, pegIndex]));
    onPegHit?.(pegIndex);
    setTimeout(() => {
      activePegsRef.current = activePegsRef.current.filter((i) => i !== pegIndex);
      setActivePegs((prev) => prev.filter((i) => i !== pegIndex));
    }, PEG_FLUSH_INTERVAL_MS);
  }, [onPegHit]);

  const handleBallLand = useCallback((roundId: number) => {
    setLandedRoundIds((prev) => new Set(prev).add(roundId));
    onLand?.(roundId);
  }, [onLand]);

  const tick = useCallback(() => {
    const realNow = performance.now();
    let simNow = simNowRef.current;
    const lastReal = lastRealNowRef.current;
    if (lastReal == null) {
      lastRealNowRef.current = realNow;
    } else {
      simNow += realNow - lastReal;
      simNowRef.current = simNow;
      lastRealNowRef.current = realNow;
    }
    const ballCount = playbackRef.current.size;
    const trailCap =
      ballCount >= TRAIL_OFF_ABOVE_COUNT ? 0 : ballCount > TRAIL_ABOVE_COUNT ? TRAIL_REDUCED_MAX : TRAIL_MAX;
    const next: Record<number, BallPosition> = {};
    const toRemove: number[] = [];
    playbackRef.current.forEach((entry, roundId) => {
      const elapsed = simNow - entry.startTime;
      const progress = Math.min(1, elapsed / entry.durationMs);
      const simTime = entry.path.totalSimTime * progress;
      while (
        entry.pegHitIndex < entry.path.pegHits.length &&
        entry.path.pegHits[entry.pegHitIndex].simTime <= simTime
      ) {
        const hit = entry.path.pegHits[entry.pegHitIndex];
        entry.onPegHit(hit.pegIndex);
        entry.pegHitIndex++;
      }
      const r = entry.radius;
      if (progress >= 1) {
        entry.onLand();
        entry.onComplete();
        toRemove.push(roundId);
        next[roundId] = { x: entry.path.finalX, y: entry.path.finalY, trail: [] };
        return;
      }
      const { x, y } = interpolatePath(entry.path.positions, simTime);
      if (y - r >= slotTopY) {
        entry.onLand();
        entry.onComplete();
        toRemove.push(roundId);
        next[roundId] = { x: entry.path.finalX, y: entry.path.finalY, trail: [] };
        return;
      }
      const trail =
        trailCap > 0
          ? (() => {
              const prevPos = positionsRef.current[roundId];
              const pt = { x, y };
              return prevPos ? [...prevPos.trail, pt].slice(-trailCap) : [pt];
            })()
          : [];
      next[roundId] = { x, y, trail };
    });
    positionsRef.current = next;
    const now2 = performance.now();
    if (fpsNodeRef.current && lastFrameTimeRef.current > 0) {
      const dt = now2 - lastFrameTimeRef.current;
      if (dt > 0) {
        const fps = 1000 / dt;
        if (now2 - fpsUiLastRef.current >= PEG_FLUSH_INTERVAL_MS) {
          fpsNodeRef.current.textContent = `${Math.round(fps)} FPS`;
          fpsUiLastRef.current = now2;
        }
        if (fpsLogLastRef.current === 0) fpsLogLastRef.current = now2;
        fpsFrameCountRef.current += 1;
        fpsAccumRef.current += fps;
        const sinceLog = now2 - fpsLogLastRef.current;
        if (sinceLog >= 1000) {
          const avg = fpsFrameCountRef.current > 0 ? fpsAccumRef.current / fpsFrameCountRef.current : 0;
          console.log(`[FPS] ${avg.toFixed(1)} (${fpsFrameCountRef.current} frames in ${(sinceLog / 1000).toFixed(1)}s)`);
          fpsLogLastRef.current = now2;
          fpsFrameCountRef.current = 0;
          fpsAccumRef.current = 0;
        }
      }
    }
    lastFrameTimeRef.current = now2;
    const canvas = canvasRef.current;
    if (canvas && playbackRef.current.size > 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawBalls(
          ctx,
          next,
          playbackRef.current,
          viewBoxHeightRef.current,
          playbackRef.current.size,
          gradientCacheRef.current,
          slotTopYRef.current
        );
      }
    }
    toRemove.forEach((id) => playbackRef.current.delete(id));
    if (playbackRef.current.size > 0) {
      rafIdRef.current = requestAnimationFrame(tick);
    } else {
      rafIdRef.current = 0;
      lastRealNowRef.current = null;
      lastFrameTimeRef.current = 0;
      fpsFrameCountRef.current = 0;
      fpsAccumRef.current = 0;
      setIsAnimating(false);
      setActivePegs(activePegsRef.current.slice());
      activePegsRef.current = [];
      if (fpsNodeRef.current) fpsNodeRef.current.textContent = '—';
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, []);

  const registerPlayback = useCallback(
    (
      roundId: number,
      path: RecordedPath,
      durationMs: number,
      radius: number,
      slotIndex: number,
      callbacks: { onPegHit: (pegIndex: number) => void; onLand: () => void; onComplete: () => void }
    ) => {
      const first = path.positions[0];
      const initial: BallPosition = first
        ? { x: first.x, y: first.y, trail: [] }
        : { x: path.finalX, y: path.finalY, trail: [] };
      positionsRef.current = { ...positionsRef.current, [roundId]: initial };
      playbackRef.current.set(roundId, {
        path,
        slotIndex,
        startTime: simNowRef.current,
        durationMs,
        pegHitIndex: 0,
        radius,
        onPegHit: callbacks.onPegHit,
        onLand: callbacks.onLand,
        onComplete: callbacks.onComplete,
      });
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawBalls(
            ctx,
            positionsRef.current,
            playbackRef.current,
            viewBoxHeightRef.current,
            playbackRef.current.size,
            gradientCacheRef.current,
            slotTopYRef.current
          );
        }
      }
      if (rafIdRef.current === 0) {
        if (playbackRef.current.size === 1) setIsAnimating(true);
        rafIdRef.current = requestAnimationFrame(tick);
      }
    },
    [tick]
  );

  const unregisterPlayback = useCallback((roundId: number) => {
    playbackRef.current.delete(roundId);
  }, []);

  useEffect(() => {
    setActivePegs([]);
    activePegsRef.current = [];
  }, [balls]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    };
  }, []);

  const key = `${rows}_${riskLevel}`;
  const multipliers = paytables[key] ?? [];

  const { pegPositions, slotGroupY, viewBoxHeight, slotTopY, slotBottomY } = useMemo(() => {
    const slots = rows + 1;
    const slotWidth = BOARD_W / slots;
    const rowHeight = slotWidth * ROW_HEIGHT_FACTOR;
    const positions = getPegPositions(rows);
    const slotGroupY = 18 + rows * rowHeight;
    const viewBoxHeight = positions.length ? slotGroupY + SLOT_HEIGHT + 80 : 240;
    const slotTopY = slotGroupY;
    const slotBottomY = slotGroupY + SLOT_HEIGHT;
    return { pegPositions: positions, slotGroupY, viewBoxHeight, slotTopY, slotBottomY };
  }, [rows]);
  viewBoxHeightRef.current = viewBoxHeight;
  slotTopYRef.current = slotTopY;
  slotBottomYRef.current = slotBottomY;

  return (
    <div className="board-wrap" style={{ position: 'relative' }}>
      <div ref={fpsNodeRef} className="fps-counter" aria-hidden="true">
        —
      </div>
      <div className={`board-inner${isAnimating ? ' board-animating' : ''}`} style={{ position: 'relative' }}>
        <svg
          viewBox={`0 -40 320 ${pegPositions.length ? slotGroupY + SLOT_HEIGHT + 80 : 240}`}
          className="board-svg"
          preserveAspectRatio="xMidYMin meet"
          style={{ overflow: 'visible', display: 'block' }}
          data-animating={isAnimating ? 'true' : undefined}
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
            {multipliers.length > 0 && multipliers.map((_, i) => {
              const bounds = getSlotXBounds(rows, i);
              const slotX = bounds.left;
              const slotW = bounds.right - bounds.left;
              return (
                <clipPath key={i} id={`slot-clip-${i}`}>
                  <rect x={slotX} y={0} width={slotW} height={SLOT_HEIGHT} rx={4} />
                </clipPath>
              );
            })}
          </defs>
          {pegPositions.map((p, i) => {
            const isActive = activePegs.includes(i);
            const r = isActive ? PEG_R * 1.15 : PEG_R;
            return (
              <g key={i} transform={`translate(${p.x}, ${p.y})`} style={{ transition: 'filter 0.15s ease-out' }}>
                <circle
                  r={r}
                  cx={0}
                  cy={0}
                  fill={`url(#peg-${isActive ? '3d-active' : '3d'})`}
                  filter={isAnimating ? undefined : isActive ? 'url(#peg-glow-cyan)' : 'url(#peg-glow)'}
                />
              </g>
            );
          })}
          {balls.map((ball) => (
            <Ball
              key={ball.roundId}
              roundId={ball.roundId}
              rows={ball.rows}
              slotIndex={ball.slotIndex}
              durationMs={animationDurationMs}
              onPegHit={handlePegHit}
              onLand={handleBallLand}
              onComplete={onBallComplete}
              registerPlayback={registerPlayback}
              unregisterPlayback={unregisterPlayback}
            />
          ))}
        </svg>
        <canvas
          ref={canvasRef}
          width={320}
          height={viewBoxHeight}
          className="board-canvas"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
        {/* Slots layer on top so balls fall behind them */}
        {multipliers.length > 0 && (
          <svg
            viewBox={`0 -40 320 ${pegPositions.length ? slotGroupY + SLOT_HEIGHT + 80 : 240}`}
            className="board-svg board-slots-layer"
            preserveAspectRatio="xMidYMin meet"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none',
              zIndex: 2,
            }}
            aria-hidden="true"
          >
            <g transform={`translate(0, ${slotGroupY})`}>
              {multipliers.map((mult, i) => {
                const bounds = getSlotXBounds(rows, i);
                const slotX = bounds.left;
                const slotW = bounds.right - bounds.left;
                const slotCenterX = (bounds.left + bounds.right) / 2;
                const tier = mult < 1 ? 'low' : mult >= 5 ? 'high' : 'mid';
                const intensity = winIntensityFromMultiplier(mult);
                const showAsResult = balls.some((ball) => ball.slotIndex === i && landedRoundIds.has(ball.roundId));
                const landedClass = showAsResult ? `landed-subtle-${intensity}` : '';
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
                        transition: 'all 0.15s ease',
                        ...(landedClass ? { transformOrigin: '50% 50%' } : {}),
                      }}
                    />
                    <g clipPath={`url(#slot-clip-${i})`}>
                      <text
                        x={slotCenterX}
                        y={SLOT_HEIGHT / 2 - (11 + fontSize * 1.2) / 2 + fontSize * 0.8}
                        textAnchor="middle"
                        className="slot-text"
                        style={{ fontSize }}
                      >
                        <tspan x={slotCenterX} dy={0}>{String(mult)}</tspan>
                        <tspan x={slotCenterX} dy={11}>x</tspan>
                      </text>
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
