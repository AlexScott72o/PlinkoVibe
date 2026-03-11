import { memo, useEffect, useRef } from 'react';
import { getCachedPath, scheduleRecord, clearPathCache } from '@/plinko/physicsSim';
import { getBallRadiusForRows, getSlotXBounds } from '@/plinko/boardLayout';

function ballSizeForRows(rows: number): number {
  return getBallRadiusForRows(rows) * 2;
}

interface BallProps {
  roundId: number;
  rows: number;
  slotIndex: number;
  durationMs: number;
  onPegHit?: (pegIndex: number) => void;
  onSlotReached?: () => void;
  onLand?: (roundId: number) => void;
  onComplete?: (roundId: number) => void;
  debugMode?: boolean;
  registerPlayback: (
    roundId: number,
    path: import('@/plinko/physicsSim').RecordedPath,
    durationMs: number,
    radius: number,
    slotIndex: number,
    callbacks: {
      onPegHit: (pegIndex: number) => void;
      onSlotReached: () => void;
      onLand: () => void;
      onComplete: () => void;
    }
  ) => void;
  unregisterPlayback: (roundId: number) => void;
}

function BallInner({
  roundId,
  rows,
  slotIndex,
  durationMs,
  onPegHit,
  onSlotReached,
  onLand,
  onComplete,
  debugMode = false,
  registerPlayback,
  unregisterPlayback,
}: BallProps) {
  const ballRadius = ballSizeForRows(rows) / 2;
  const onPegHitRef = useRef(onPegHit);
  const onSlotReachedRef = useRef(onSlotReached);
  const onLandRef = useRef(onLand);
  const onCompleteRef = useRef(onComplete);
  onPegHitRef.current = onPegHit;
  onSlotReachedRef.current = onSlotReached;
  onLandRef.current = onLand;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let cancelled = false;
    const bounds = getSlotXBounds(rows, slotIndex);
    const eps = 0.01; /* allow for floating point in physics */
    const pathMatchesSlot = (path: import('@/plinko/physicsSim').RecordedPath) =>
      path.finalX >= bounds.left - eps && path.finalX <= bounds.right + eps;
    const doRegister = (path: import('@/plinko/physicsSim').RecordedPath) => {
      if (!pathMatchesSlot(path)) {
        if (debugMode) {
          console.log('[Plinko debug] pathMatchesSlot REJECT', {
            roundId,
            slotIndex,
            pathFinalX: path.finalX.toFixed(2),
            bounds: { left: bounds.left.toFixed(2), right: bounds.right.toFixed(2) },
          });
        }
        return false;
      }
      registerPlayback(roundId, path, durationMs, ballRadius, slotIndex, {
        onPegHit: (pegIndex) => onPegHitRef.current?.(pegIndex),
        onSlotReached: () => onSlotReachedRef.current?.(),
        onLand: () => onLandRef.current?.(roundId),
        onComplete: () => onCompleteRef.current?.(roundId),
      });
      return true;
    };
    const cached = getCachedPath(rows, slotIndex);
    if (cached) {
      if (doRegister(cached)) {
        return () => unregisterPlayback(roundId);
      }
      clearPathCache(rows, slotIndex);
    }
    let retried = false;
    const tryRecord = () => {
      scheduleRecord(rows, slotIndex, ballRadius).then((path) => {
        if (cancelled) return;
        if (doRegister(path)) return;
        if (!retried) {
          retried = true;
          clearPathCache(rows, slotIndex);
          tryRecord();
        }
      }).catch(() => {});
    };
    tryRecord();
    return () => {
      cancelled = true;
      unregisterPlayback(roundId);
    };
  }, [roundId, rows, slotIndex, ballRadius, durationMs, registerPlayback, unregisterPlayback]);

  return null;
}

export const Ball = memo(BallInner);
