import type { ConfigResponse, RiskLevel } from 'shared';
import { MIN_BALLS, MAX_BALLS } from '@/hooks/usePlinko';

interface ControlsProps {
  config: ConfigResponse | null;
  betAmount: number;
  setBetAmount: (v: number) => void;
  numBalls: number;
  setNumBalls: (v: number) => void;
  totalBet: number;
  rows: number;
  setRows: (v: number) => void;
  riskLevel: RiskLevel;
  setRiskLevel: (v: RiskLevel) => void;
  playing: boolean;
  onPlay: () => void;
  error: string | null;
  balance: number;
  hideBetButton?: boolean;
}

function clampBalls(v: number): number {
  return Math.max(MIN_BALLS, Math.min(MAX_BALLS, Math.floor(Number(v)) || MIN_BALLS));
}

export function Controls({
  config,
  betAmount,
  setBetAmount,
  numBalls,
  setNumBalls,
  totalBet,
  rows,
  setRows,
  riskLevel,
  setRiskLevel,
  playing,
  onPlay,
  error,
  balance,
  hideBetButton,
}: ControlsProps) {
  const rowsList = config?.rows ?? [8, 10, 12, 14];
  const riskList = config?.riskLevels ?? (['low', 'medium', 'high'] as RiskLevel[]);
  const minBet = config?.minBet ?? 0.1;
  const maxBet = config?.maxBet ?? 1000;
  const step = 0.1;

  const canBet = config && balance >= totalBet && betAmount >= minBet && betAmount <= maxBet && numBalls >= MIN_BALLS && numBalls <= MAX_BALLS && !playing;

  return (
    <div className={`controls-panel panel-overlay ${playing ? 'controls-disabled' : ''}`}>
      {error && <div className="error-msg">{error}</div>}
      
      <div className="control-group">
        <span className="control-label">Bet Amount</span>
        <div className="bet-input-row">
          <button
            type="button"
            className="btn-bet-adjust"
            onClick={() => setBetAmount(Math.max(minBet, betAmount - step))}
            disabled={playing}
          >
            −
          </button>
          <span className="bet-value-display">{betAmount.toFixed(2)}</span>
          <button
            type="button"
            className="btn-bet-adjust"
            onClick={() => setBetAmount(Math.min(maxBet, betAmount + step))}
            disabled={playing}
          >
            +
          </button>
        </div>
        <div className="slider-container">
          <input
            type="range"
            min={minBet}
            max={maxBet}
            step={step}
            value={betAmount}
            onChange={(e) => setBetAmount(parseFloat(e.target.value))}
            className="bet-slider"
            disabled={playing}
          />
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">Balls</span>
        <div className="bet-input-row">
          <button
            type="button"
            className="btn-bet-adjust"
            onClick={() => setNumBalls(clampBalls(numBalls - 1))}
            disabled={playing || numBalls <= MIN_BALLS}
          >
            −
          </button>
          <input
            type="number"
            min={MIN_BALLS}
            max={MAX_BALLS}
            step={1}
            value={numBalls}
            onChange={(e) => setNumBalls(clampBalls(Number(e.target.value)))}
            onBlur={() => setNumBalls(clampBalls(numBalls))}
            disabled={playing}
            className="bet-value-input"
            aria-label="Number of balls"
          />
          <button
            type="button"
            className="btn-bet-adjust"
            onClick={() => setNumBalls(clampBalls(numBalls + 1))}
            disabled={playing || numBalls >= MAX_BALLS}
          >
            +
          </button>
        </div>
        <div className="slider-container">
          <input
            type="range"
            min={MIN_BALLS}
            max={MAX_BALLS}
            step={1}
            value={numBalls}
            onChange={(e) => setNumBalls(clampBalls(parseInt(e.target.value, 10)))}
            className="bet-slider"
            disabled={playing}
          />
        </div>
      </div>

      <div className="control-group">
        <span className="control-label tooltip-wrap">
          Risk Level
          <span className="tooltip-icon">?</span>
          <span className="tooltip-content">Higher risk = bigger edge multipliers, smaller center multipliers.</span>
        </span>
        <div className="risk-selectors">
          {riskList.map((r) => (
            <button
              key={r}
              type="button"
              className={`btn btn-secondary ${riskLevel === r ? `active-${r}` : ''}`}
              onClick={() => setRiskLevel(r)}
              disabled={playing}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label tooltip-wrap">
          Rows
          <span className="tooltip-icon">?</span>
          <span className="tooltip-content">More rows = more pegs, higher maximum payouts.</span>
        </span>
        <div className="row-selectors">
          {rowsList.map((r) => (
            <button
              key={r}
              type="button"
              className={`btn btn-secondary ${rows === r ? 'active-low' : ''}`}
              onClick={() => setRows(r)}
              disabled={playing}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {!hideBetButton && (
        <div className="action-row">
          <div className="action-row-buttons">
            <button
              type="button"
              className="btn-bet-adjust btn-bet-adjust-inline"
              onClick={() => setBetAmount(Math.max(minBet, betAmount - step))}
              disabled={playing}
              aria-label="Decrease bet"
            >
              −
            </button>
            <button
              type="button"
              className={`btn btn-primary btn-play btn-spin-icon ${error === 'Insufficient balance' ? 'btn-shake' : ''}`}
              onClick={onPlay}
              disabled={!canBet && error !== 'Insufficient balance'}
              aria-label={playing ? 'Spinning...' : `Spin – bet ${totalBet}`}
            >
              {playing ? (
                <span className="btn-spin-icon-inner spin-loading" aria-hidden="true" />
              ) : (
                <svg className="btn-spin-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                  <path d="m21 12-3-3" />
                  <path d="M21 12h-4" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="btn-bet-adjust btn-bet-adjust-inline"
              onClick={() => setBetAmount(Math.min(maxBet, betAmount + step))}
              disabled={playing}
              aria-label="Increase bet"
            >
              +
            </button>
          </div>
          <span className="play-bet-amount">
            BET {Number.isInteger(totalBet) ? totalBet : totalBet.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
