import { useEffect, useRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  GraphicsContext,
  FillGradient,
  Text,
  TextStyle,
} from 'pixi.js';
import type { RiskLevel } from 'shared';
import type { ActiveBall } from '@/hooks/usePlinko';
import {
  getPegPositions,
  getSlotXBounds,
  getBallRadiusForRows,
  BOARD_WIDTH,
  ROW_HEIGHT_FACTOR,
} from '@/plinko/boardLayout';
import {
  getCachedPath,
  scheduleRecord,
  clearPathCache,
  interpolatePath,
} from '@/plinko/physicsSim';
import type { RecordedPath } from '@/plinko/physicsSim';
import { winIntensityFromMultiplier, type WinIntensity } from '@/plinko/winIntensity';

// ── Constants ─────────────────────────────────────────────────────────────────

const VIEWBOX_Y_OFFSET = 40;
const PEG_R_IDLE = 2.304;
const PEG_R_ACTIVE = PEG_R_IDLE * 1.15;
const PEG_FLUSH_MS = 80;
const SLOT_HEIGHT = 36;
const TRAIL_MAX = 6;
const TRAIL_OFF_ABOVE = 10;
const TRAIL_REDUCED_MAX = 2;
const TRAIL_ABOVE_COUNT = 25;
const SOLID_BALL_ABOVE = 12;

const TRAIL_COLOR      = 0x00e5ff;
const BALL_SOLID_COLOR = 0xc8f0ff;
// Text is rendered at TEXT_PRESCALE× the logical font size then scaled back down so
// the bitmap texture has enough pixels even after the board container's CSS upscale.
const TEXT_PRESCALE = 4;

// ── Types ─────────────────────────────────────────────────────────────────────

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

type BallEntry = {
  gfx: Graphics;
  trail: Array<{ x: number; y: number }>;
};

type SlotAnim = {
  elapsed: number;
  duration: number;
  intensity: WinIntensity;
};

type PixiScene = {
  app: Application;
  boardContainer: Container;
  bgGfx: Graphics;
  pegsContainer: Container;
  pegGfxList: Graphics[];
  trailGfx: Graphics;
  ballsContainer: Container;
  slotsContainer: Container;
  pegIdleCtx: GraphicsContext;
  pegActiveCtx: GraphicsContext;
};

// Slot containers have extra metadata attached
type SlotContainer = Container & {
  __bg: Graphics;
  __baseColor: number;
  __mult: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeLayout(rows: number) {
  const slotWidth = BOARD_WIDTH / (rows + 1);
  const rowHeight = slotWidth * ROW_HEIGHT_FACTOR;
  const slotGroupY = 18 + rows * rowHeight;
  const viewBoxHeight = slotGroupY + SLOT_HEIGHT + 80;
  return { slotGroupY, viewBoxHeight, slotTopY: slotGroupY };
}

type SlotTierStyle = {
  bgOuter: number; bgInner: number;
  borderColor: number; borderWidth: number;
  textFill: string;
};

/** Returns colours and border style for a multiplier value. Outer/high slots get warm glowing colours. */
function slotTier(mult: number): SlotTierStyle {
  if (mult >= 20) return { bgOuter: 0x1a0008, bgInner: 0x2e0014, borderColor: 0xff2255, borderWidth: 1.5, textFill: '#ff6688' };
  if (mult >= 10) return { bgOuter: 0x190800, bgInner: 0x2c1200, borderColor: 0xff8833, borderWidth: 1.5, textFill: '#ffaa66' };
  if (mult >= 5)  return { bgOuter: 0x181000, bgInner: 0x261a00, borderColor: 0xffcc44, borderWidth: 1,   textFill: '#ffd966' };
  if (mult >= 2)  return { bgOuter: 0x071620, bgInner: 0x0c2030, borderColor: 0x00b8e8, borderWidth: 1,   textFill: '#55ccee' };
  if (mult >= 1)  return { bgOuter: 0x060c16, bgInner: 0x0a1422, borderColor: 0x224488, borderWidth: 1,   textFill: '#5577bb' };
  if (mult >= 0.5) return { bgOuter: 0x07070f, bgInner: 0x0c0c1a, borderColor: 0x3a2860, borderWidth: 1,  textFill: '#6655aa' };
  return                 { bgOuter: 0x050508, bgInner: 0x08080e, borderColor: 0x1a1a26, borderWidth: 1,   textFill: '#3d3d55' };
}

function makePegContexts(): { pegIdleCtx: GraphicsContext; pegActiveCtx: GraphicsContext } {
  // Layered circles give a 3D peg look without relying on gradient texture mapping
  const pegIdleCtx = new GraphicsContext()
    .circle(0, 0, PEG_R_IDLE)
    .fill({ color: 0xc8c8d8 })
    .circle(-PEG_R_IDLE * 0.35, -PEG_R_IDLE * 0.35, PEG_R_IDLE * 0.4)
    .fill({ color: 0xffffff });

  const pegActiveCtx = new GraphicsContext()
    .circle(0, 0, PEG_R_ACTIVE)
    .fill({ color: 0xa0b8cc })
    .circle(-PEG_R_ACTIVE * 0.35, -PEG_R_ACTIVE * 0.35, PEG_R_ACTIVE * 0.4)
    .fill({ color: 0xffffff });

  return { pegIdleCtx, pegActiveCtx };
}

/** Draw a glossy sphere using layered concentric circles (FillGradient is unreliable for small shapes). */
function drawBallSphere(gfx: Graphics, r: number) {
  gfx
    .circle(0, 0, r).fill({ color: 0x0a3c82 })            // outer dark-blue rim
    .circle(0, 0, r * 0.82).fill({ color: 0x1878c8 })     // mid-blue body
    .circle(0, 0, r * 0.60).fill({ color: 0x50b8f0 })     // lighter inner
    .circle(-r * 0.28, -r * 0.28, r * 0.26)               // soft highlight blob
      .fill({ color: 0xdcf8ff })
    .circle(-r * 0.14, -r * 0.14, r * 0.10)               // specular
      .fill({ color: 0xffffff });
}

function drawBgGlow(bgGfx: Graphics, viewBoxHeight: number) {
  bgGfx.clear();
  // Subtle radial ambient glow behind the board
  const ambientGrad = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.35 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.35 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0,   color: 'rgba(0,80,120,0.18)' },
      { offset: 0.5, color: 'rgba(0,40,80,0.08)'  },
      { offset: 1,   color: 'rgba(0,0,0,0)'        },
    ],
  });
  bgGfx.rect(0, -VIEWBOX_Y_OFFSET, BOARD_WIDTH, viewBoxHeight + VIEWBOX_Y_OFFSET).fill(ambientGrad);
}

// ── Particle burst (dramatic wins) ───────────────────────────────────────────

type Particle = {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;   // 0–1, 0 = just born, 1 = dead
  maxLife: number; // ms
};

function spawnWinParticles(
  particles: Particle[],
  scene: PixiScene,
  slotIndex: number,
  rows: number,
  intensity: WinIntensity,
) {
  if (intensity === 'minimal') return;
  const bounds = getSlotXBounds(rows, slotIndex);
  const slotCenterX = (bounds.left + bounds.right) / 2;
  const { slotGroupY } = computeLayout(rows);
  const slotCenterY = slotGroupY + SLOT_HEIGHT / 2;
  const count = intensity === 'dramatic' ? 18 : 10;
  const speedScale = intensity === 'dramatic' ? 1.6 : 1.0;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = (0.06 + Math.random() * 0.1) * speedScale;
    const r = 1.5 + Math.random() * 1.5;
    const color = intensity === 'dramatic'
      ? (Math.random() > 0.5 ? 0x00e5ff : 0xffffff)
      : 0x00e5ff;

    const gfx = new Graphics();
    gfx.circle(0, 0, r).fill({ color, alpha: 0.9 });
    gfx.x = slotCenterX;
    gfx.y = slotCenterY;
    scene.ballsContainer.addChild(gfx);

    particles.push({
      gfx,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.08,
      life: 0,
      maxLife: 300 + Math.random() * 200,
    });
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface BoardProps {
  rows: number;
  riskLevel: RiskLevel;
  paytables: Record<string, number[]>;
  activeBalls?: ActiveBall[] | null;
  animationDurationMs: number;
  onBallComplete: (roundId: number) => void;
  onPegHit?: (rowIndex: number) => void;
  onLand?: (roundId: number) => void;
}

export function Board({
  rows,
  riskLevel,
  paytables,
  activeBalls = [],
  animationDurationMs,
  onBallComplete,
  onPegHit,
  onLand,
}: BoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PixiScene | null>(null);

  // Callback refs – read inside ticker/async callbacks to avoid stale closures
  const onBallCompleteRef = useRef(onBallComplete);
  const onPegHitRef       = useRef(onPegHit);
  const onLandRef         = useRef(onLand);
  onBallCompleteRef.current = onBallComplete;
  onPegHitRef.current       = onPegHit;
  onLandRef.current         = onLand;

  // Dynamic prop refs
  const rowsRef      = useRef(rows);
  const riskRef      = useRef(riskLevel);
  const paytablesRef = useRef(paytables);
  const animDurRef   = useRef(animationDurationMs);
  rowsRef.current      = rows;
  riskRef.current      = riskLevel;
  paytablesRef.current = paytables;
  animDurRef.current   = animationDurationMs;

  // Imperative animation state (lives outside React render cycle)
  const particlesRef      = useRef<Particle[]>([]);
  const playbackRef       = useRef<Map<number, PlaybackEntry>>(new Map());
  const ballEntriesRef    = useRef<Map<number, BallEntry>>(new Map());
  const simNowRef         = useRef(0);
  const landedRoundIds    = useRef<Set<number>>(new Set());
  const slotAnimsRef      = useRef<Map<number, SlotAnim>>(new Map());

  // ── Scene helpers ────────────────────────────────────────────────────────

  function buildPegs() {
    const scene = sceneRef.current;
    if (!scene) return;
    const { pegsContainer, pegIdleCtx, pegGfxList } = scene;
    // Destroy old pegs
    for (const p of pegGfxList) {
      pegsContainer.removeChild(p);
      p.destroy();
    }
    pegGfxList.length = 0;

    const positions = getPegPositions(rowsRef.current);
    for (const pos of positions) {
      const g = new Graphics(pegIdleCtx);
      g.x = pos.x;
      g.y = pos.y;
      pegsContainer.addChild(g);
      pegGfxList.push(g);
    }
  }

  function buildSlots() {
    const scene = sceneRef.current;
    if (!scene) return;
    const { slotsContainer } = scene;

    // Destroy old slots
    for (const child of [...slotsContainer.children]) {
      child.destroy({ children: true });
    }
    slotsContainer.removeChildren();
    slotAnimsRef.current.clear();

    const key = `${rowsRef.current}_${riskRef.current}`;
    const multipliers = paytablesRef.current[key] ?? [];
    const { slotGroupY } = computeLayout(rowsRef.current);

    for (let i = 0; i < multipliers.length; i++) {
      const mult = multipliers[i]!;
      const bounds = getSlotXBounds(rowsRef.current, i);
      const slotW = bounds.right - bounds.left;
      const tier = slotTier(mult);

      const slotCont = new Container() as SlotContainer;
      // Position slot center for scale-pivot animations
      slotCont.x = bounds.left + slotW / 2;
      slotCont.y = slotGroupY + SLOT_HEIGHT / 2;
      slotCont.pivot.set(slotW / 2, SLOT_HEIGHT / 2);
      slotCont.__baseColor = tier.bgOuter;
      slotCont.__mult = mult;

      const bg = new Graphics();
      // Two-layer background for depth, plus a coloured border per tier
      bg.roundRect(0, 0, slotW, SLOT_HEIGHT, 4).fill({ color: tier.bgOuter });
      bg.roundRect(1, 1, slotW - 2, SLOT_HEIGHT - 2, 3).fill({ color: tier.bgInner });
      bg.roundRect(0, 0, slotW, SLOT_HEIGHT, 4)
        .stroke({ color: tier.borderColor, width: tier.borderWidth, alpha: 0.9 });
      slotCont.__bg = bg;

      // Prescale text 4× then scale back down → bitmap has 4× more pixels → crisp
      const baseFontPx = Math.min(11, Math.max(6.5, slotW * 0.28));
      const label = new Text({
        text: `${mult}x`,
        style: new TextStyle({
          fontFamily: '"Space Mono", monospace',
          fontSize: baseFontPx * TEXT_PRESCALE,
          fill: tier.textFill,
          align: 'center',
          fontWeight: '700',
        }),
        anchor: { x: 0.5, y: 0.5 },
      });
      label.scale.set(1 / TEXT_PRESCALE);
      label.x = slotW / 2;
      label.y = SLOT_HEIGHT / 2;

      slotCont.addChild(bg, label);
      slotsContainer.addChild(slotCont);
    }
  }

  function updateSlotHighlight(slotIndex: number, highlight: boolean) {
    const scene = sceneRef.current;
    if (!scene) return;
    const slotCont = scene.slotsContainer.children[slotIndex] as SlotContainer | undefined;
    if (!slotCont) return;
    const bg = slotCont.__bg;
    if (!bg) return;
    const bounds = getSlotXBounds(rowsRef.current, slotIndex);
    const slotW = bounds.right - bounds.left;
    bg.clear();
    if (highlight) {
      bg.roundRect(0, 0, slotW, SLOT_HEIGHT, 4).fill({ color: 0x003c50 });
      bg.roundRect(1, 1, slotW - 2, SLOT_HEIGHT - 2, 3).fill({ color: 0x005468 });
      bg.roundRect(0, 0, slotW, SLOT_HEIGHT, 4)
        .stroke({ color: 0x00e5ff, width: 1.5, alpha: 1 });
    } else {
      const tier = slotTier(slotCont.__mult);
      bg.roundRect(0, 0, slotW, SLOT_HEIGHT, 4).fill({ color: tier.bgOuter });
      bg.roundRect(1, 1, slotW - 2, SLOT_HEIGHT - 2, 3).fill({ color: tier.bgInner });
      bg.roundRect(0, 0, slotW, SLOT_HEIGHT, 4)
        .stroke({ color: tier.borderColor, width: tier.borderWidth, alpha: 0.9 });
      // Restore scale after animation
      (scene.slotsContainer.children[slotIndex] as Container).scale.set(1);
    }
  }

  function updateAllSlotHighlights() {
    const scene = sceneRef.current;
    if (!scene) return;
    const key = `${rowsRef.current}_${riskRef.current}`;
    const mults = paytablesRef.current[key] ?? [];
    for (let i = 0; i < mults.length; i++) {
      let isLanded = false;
      playbackRef.current.forEach((entry, rId) => {
        if (entry.slotIndex === i && landedRoundIds.current.has(rId)) {
          isLanded = true;
        }
      });
      updateSlotHighlight(i, isLanded);
    }
  }

  function handlePegHit(pegIndex: number) {
    const scene = sceneRef.current;
    if (!scene) return;
    const gfx = scene.pegGfxList[pegIndex];
    if (!gfx) return;
    gfx.context = scene.pegActiveCtx;
    gfx.tint = 0x88eeff;
    setTimeout(() => {
      if (gfx.context === scene.pegActiveCtx) {
        gfx.context = scene.pegIdleCtx;
        gfx.tint = 0xffffff;
      }
    }, PEG_FLUSH_MS);
  }

  function triggerSlotAnim(slotIndex: number, intensity: WinIntensity) {
    const duration = intensity === 'minimal' ? 80 : intensity === 'bolder' ? 160 : 280;
    slotAnimsRef.current.set(slotIndex, { elapsed: 0, duration, intensity });
  }

  function registerPlayback(
    roundId: number,
    path: RecordedPath,
    durationMs: number,
    radius: number,
    slotIndex: number,
  ) {
    const scene = sceneRef.current;
    if (!scene) return;

    const ballCount = ballEntriesRef.current.size;
    const useSolid = ballCount >= SOLID_BALL_ABOVE;
    const gfx = new Graphics();
    if (useSolid) {
      gfx.circle(0, 0, radius).fill({ color: BALL_SOLID_COLOR, alpha: 0.95 });
    } else {
      drawBallSphere(gfx, radius);
    }
    if (path.positions.length > 0) {
      gfx.x = path.positions[0]!.x;
      gfx.y = path.positions[0]!.y;
    }
    scene.ballsContainer.addChild(gfx);
    ballEntriesRef.current.set(roundId, { gfx, trail: [] });

    playbackRef.current.set(roundId, {
      path,
      slotIndex,
      startTime: simNowRef.current,
      durationMs,
      pegHitIndex: 0,
      radius,
      onPegHit: (pegIdx) => {
        handlePegHit(pegIdx);
        onPegHitRef.current?.(pegIdx);
      },
      onLand: () => {
        if (landedRoundIds.current.has(roundId)) return;
        landedRoundIds.current.add(roundId);
        onLandRef.current?.(roundId);
        const key = `${rowsRef.current}_${riskRef.current}`;
        const mults = paytablesRef.current[key] ?? [];
        const mult = mults[slotIndex] ?? 1;
        const intensity = winIntensityFromMultiplier(mult);
        triggerSlotAnim(slotIndex, intensity);
        updateSlotHighlight(slotIndex, true);
        const sc = sceneRef.current;
        if (sc) spawnWinParticles(particlesRef.current, sc, slotIndex, rowsRef.current, intensity);
      },
      onComplete: () => {
        const be = ballEntriesRef.current.get(roundId);
        if (be) {
          if (be.gfx.parent) scene.ballsContainer.removeChild(be.gfx);
          be.gfx.destroy();
          ballEntriesRef.current.delete(roundId);
        }
        playbackRef.current.delete(roundId);
        landedRoundIds.current.delete(roundId);
        onBallCompleteRef.current(roundId);
        // Un-highlight after a short delay
        setTimeout(() => updateAllSlotHighlights(), 450);
      },
    });
  }

  function unregisterPlayback(roundId: number) {
    const be = ballEntriesRef.current.get(roundId);
    if (be) {
      const scene = sceneRef.current;
      if (scene && be.gfx.parent) scene.ballsContainer.removeChild(be.gfx);
      be.gfx.destroy();
      ballEntriesRef.current.delete(roundId);
    }
    playbackRef.current.delete(roundId);
    landedRoundIds.current.delete(roundId);
  }

  // ── Ticker ───────────────────────────────────────────────────────────────

  const tickRef = useRef<(ticker: { deltaMS: number }) => void>(() => undefined);

  tickRef.current = (ticker: { deltaMS: number }) => {
    const scene = sceneRef.current;
    if (!scene) return;

    simNowRef.current += ticker.deltaMS;
    const simNow = simNowRef.current;

    const ballCount = playbackRef.current.size;
    const trailCap =
      ballCount >= TRAIL_OFF_ABOVE
        ? 0
        : ballCount > TRAIL_ABOVE_COUNT
          ? TRAIL_REDUCED_MAX
          : TRAIL_MAX;

    const { slotTopY } = computeLayout(rowsRef.current);

    // Clear trails for this frame
    scene.trailGfx.clear();

    const toComplete: number[] = [];

    playbackRef.current.forEach((entry, roundId) => {
      const be = ballEntriesRef.current.get(roundId);
      if (!be) return;

      const elapsed = simNow - entry.startTime;
      const progress = Math.min(1, elapsed / entry.durationMs);
      const simTime = entry.path.totalSimTime * progress;

      // Fire peg hits
      while (
        entry.pegHitIndex < entry.path.pegHits.length &&
        entry.path.pegHits[entry.pegHitIndex]!.simTime <= simTime
      ) {
        entry.onPegHit(entry.path.pegHits[entry.pegHitIndex]!.pegIndex);
        entry.pegHitIndex++;
      }

      const r = entry.radius;

      if (progress >= 1) {
        be.gfx.x = entry.path.finalX;
        be.gfx.y = entry.path.finalY;
        entry.onLand();
        toComplete.push(roundId);
        return;
      }

      const { x, y } = interpolatePath(entry.path.positions, simTime);

      if (y - r >= slotTopY) {
        be.gfx.x = entry.path.finalX;
        be.gfx.y = entry.path.finalY;
        entry.onLand();
        toComplete.push(roundId);
        return;
      }

      // Clamp ball center so it never visually enters the slot area
      const maxCenterY = slotTopY - 2 * r;
      const drawY = Math.min(y, maxCenterY);

      be.gfx.x = x;
      be.gfx.y = drawY;
      be.gfx.visible = true;

      // Trails
      if (trailCap > 0) {
        be.trail = [...be.trail, { x, y: drawY }].slice(-trailCap);
        const trailR = Math.max(r - 1, 2);
        for (let i = 0; i < be.trail.length; i++) {
          const p = be.trail[i]!;
          const trailY = Math.min(p.y, slotTopY - 2 * trailR);
          const alpha = ((i + 1) / be.trail.length) * 0.35;
          scene.trailGfx.circle(p.x, trailY, trailR).fill({ color: TRAIL_COLOR, alpha });
        }
      } else {
        be.trail = [];
      }
    });

    // Complete finished balls
    for (const id of toComplete) {
      const entry = playbackRef.current.get(id);
      if (entry) entry.onComplete();
    }

    // Slot landing animations
    slotAnimsRef.current.forEach((anim, slotIndex) => {
      anim.elapsed += ticker.deltaMS;
      const progress = Math.min(1, anim.elapsed / anim.duration);
      const eased = Math.sin(progress * Math.PI); // 0→1→0 pulse

      const slotCont = scene.slotsContainer.children[slotIndex] as Container | undefined;
      if (slotCont) {
        if (anim.intensity === 'minimal') {
          slotCont.alpha = 1 + 0.2 * eased;
        } else if (anim.intensity === 'bolder') {
          const s = 1 + 0.04 * eased;
          slotCont.scale.set(s);
          slotCont.alpha = 1 + 0.3 * eased;
        } else {
          // dramatic
          const s = 1 + 0.06 * eased;
          slotCont.scale.set(s);
          slotCont.alpha = 1 + 0.5 * eased;
        }
      }

      if (progress >= 1) {
        slotAnimsRef.current.delete(slotIndex);
        if (slotCont) {
          slotCont.scale.set(1);
          slotCont.alpha = 1;
        }
      }
    });

    // Particle update
    const particles = particlesRef.current;
    if (particles.length > 0) {
      const deadParticles: Particle[] = [];
      for (const p of particles) {
        p.life += ticker.deltaMS;
        const t = p.life / p.maxLife;
        if (t >= 1) {
          deadParticles.push(p);
          continue;
        }
        p.vy += 0.003; // gravity
        p.gfx.x += p.vx * ticker.deltaMS;
        p.gfx.y += p.vy * ticker.deltaMS;
        p.gfx.alpha = 1 - t * t;
        p.gfx.scale.set(1 - t * 0.5);
      }
      for (const p of deadParticles) {
        if (p.gfx.parent) scene.ballsContainer.removeChild(p.gfx);
        p.gfx.destroy();
        particles.splice(particles.indexOf(p), 1);
      }
    }

  };

  // ── Initialize PixiJS ────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let appReady = false;
    const app = new Application();

    const init = async () => {
      const w = container.clientWidth || BOARD_WIDTH;
      const { viewBoxHeight } = computeLayout(rowsRef.current);
      const scale0 = w / BOARD_WIDTH;
      const totalH = Math.round((VIEWBOX_Y_OFFSET + viewBoxHeight) * scale0);

      await app.init({
        width: w,
        height: totalH,
        background: 0x0d1117, // match CSS --color-bg-base; avoids composite transparency issues
        antialias: true,
        // autoDensity:false means PixiJS never touches canvas.style, so CSS rules apply cleanly
        resolution: 1,
        autoDensity: false,
      });

      // PixiJS v8 bug: when resizeTo is not used the ResizePlugin never sets _cancelResize,
      // but destroy() calls it unconditionally. Patch with a no-op to avoid the TypeError in
      // React Strict Mode (which runs cleanup before init finishes on the first effect pass).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(app as any)._cancelResize) (app as any)._cancelResize = () => {};

      appReady = true;

      if (destroyed) {
        // Cleanup ran before init finished; destroy now that app is ready
        app.destroy(true);
        return;
      }

      // Canvas styling – class only; CSS controls display sizing
      const canvas = app.canvas as HTMLCanvasElement;
      canvas.className = 'board-canvas';
      container.appendChild(canvas);

      // ── Build scene graph ──────────────────────────────────────────────

      // Background
      const bgGfx = new Graphics();
      drawBgGlow(bgGfx, viewBoxHeight);

      // Pegs
      const { pegIdleCtx, pegActiveCtx } = makePegContexts();
      const pegsContainer = new Container();

      // Trails (single Graphics redrawn every frame)
      const trailGfx = new Graphics();

      // Balls
      const ballsContainer = new Container();

      // Slots
      const slotsContainer = new Container();

      // Board container: apply scale + Y-offset so game coords (0,0) appear at pixel (0, VIEWBOX_Y_OFFSET)
      const boardContainer = new Container();
      boardContainer.scale.set(scale0);
      boardContainer.y = VIEWBOX_Y_OFFSET * scale0;
      boardContainer.addChild(bgGfx, pegsContainer, trailGfx, ballsContainer, slotsContainer);
      app.stage.addChild(boardContainer);

      sceneRef.current = {
        app,
        boardContainer,
        bgGfx,
        pegsContainer,
        pegGfxList: [],
        trailGfx,
        ballsContainer,
        slotsContainer,
        pegIdleCtx,
        pegActiveCtx,
      };

      // Build initial pegs and slots
      buildPegs();
      buildSlots();

      // Start ticker
      app.ticker.add((t) => tickRef.current(t));

      // ResizeObserver: keep buffer at the canvas's actual displayed pixel size
      // (canvas.getBoundingClientRect().width tracks CSS sizing on both mobile and desktop)
      const ro = new ResizeObserver(() => {
        if (!sceneRef.current) return;
        const rect = canvas.getBoundingClientRect();
        const newW = Math.round(rect.width) || container.clientWidth;
        if (!newW) return;
        const { viewBoxHeight: newVBH } = computeLayout(rowsRef.current);
        const newScale = newW / BOARD_WIDTH;
        const newH = Math.round((VIEWBOX_Y_OFFSET + newVBH) * newScale);

        app.renderer.resize(newW, newH);
        boardContainer.scale.set(newScale);
        boardContainer.y = VIEWBOX_Y_OFFSET * newScale;
        drawBgGlow(bgGfx, newVBH);
      });
      ro.observe(canvas);

      // Store ro for cleanup
      (container as HTMLDivElement & { __pixiRo?: ResizeObserver }).__pixiRo = ro;
    };

    init().catch(console.error);

    return () => {
      destroyed = true;
      const ro = (container as HTMLDivElement & { __pixiRo?: ResizeObserver }).__pixiRo;
      if (ro) ro.disconnect();
      if (sceneRef.current) {
        sceneRef.current.pegIdleCtx.destroy();
        sceneRef.current.pegActiveCtx.destroy();
        sceneRef.current = null;
      }
      // Only call destroy() if init() already resolved; otherwise the check inside init() handles it
      if (appReady) {
        try {
          app.destroy(true, { children: true });
        } catch {
          // Ignore errors during cleanup
        }
        const canvas = container.querySelector('canvas');
        if (canvas) container.removeChild(canvas);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild pegs + slots when config changes ─────────────────────────────

  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const { viewBoxHeight } = computeLayout(rows);
    const container = containerRef.current;
    const newW = container?.clientWidth ?? BOARD_WIDTH;
    const newScale = newW / BOARD_WIDTH;
    const newH = Math.round((VIEWBOX_Y_OFFSET + viewBoxHeight) * newScale);
    scene.app.renderer.resize(newW, newH);
    scene.boardContainer.scale.set(newScale);
    scene.boardContainer.y = VIEWBOX_Y_OFFSET * newScale;
    drawBgGlow(scene.bgGfx, viewBoxHeight);
    buildPegs();
    buildSlots();
  }, [rows, riskLevel, paytables]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle new active balls ───────────────────────────────────────────────

  useEffect(() => {
    const balls = activeBalls ?? [];
    const currentPlayback = playbackRef.current;

    // Find balls that were removed (completed/cancelled)
    currentPlayback.forEach((_, roundId) => {
      if (!balls.find((b) => b.roundId === roundId)) {
        unregisterPlayback(roundId);
      }
    });

    // Find balls that are new
    for (const ball of balls) {
      if (currentPlayback.has(ball.roundId)) continue;
      if (ballEntriesRef.current.has(ball.roundId)) continue;

      const roundId = ball.roundId;
      const ballRadius = getBallRadiusForRows(ball.rows);
      const durationMs = animDurRef.current;
      const slotIndex = ball.slotIndex;
      const eps = 0.01;

      const doRegister = (path: RecordedPath): boolean => {
        const bounds = getSlotXBounds(ball.rows, slotIndex);
        if (path.finalX < bounds.left - eps || path.finalX > bounds.right + eps) return false;
        registerPlayback(roundId, path, durationMs, ballRadius, slotIndex);
        return true;
      };

      const cached = getCachedPath(ball.rows, slotIndex);
      if (cached) {
        if (doRegister(cached)) continue;
        clearPathCache(ball.rows, slotIndex);
      }

      let retried = false;
      const tryRecord = () => {
        scheduleRecord(ball.rows, slotIndex, ballRadius)
          .then((path) => {
            if (doRegister(path)) return;
            if (!retried) {
              retried = true;
              clearPathCache(ball.rows, slotIndex);
              tryRecord();
            }
          })
          .catch(() => {});
      };
      tryRecord();
    }
  }, [activeBalls]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="board-wrap" ref={containerRef} />;
}
