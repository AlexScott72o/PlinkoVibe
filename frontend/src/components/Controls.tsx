import type { ConfigResponse, RiskLevel } from 'shared';
import type { AnimationSpeed } from '../hooks/usePlinko';

interface ControlsProps {
  config: ConfigResponse | null;
  betAmount: number;
  setBetAmount: (v: number) => void;
  rows: number;
  setRows: (v: number) => void;
  riskLevel: RiskLevel;
  setRiskLevel: (v: RiskLevel) => void;
  animationSpeed: AnimationSpeed;
  setAnimationSpeed: (v: AnimationSpeed) => void;
  playing: boolean;
  onPlay: () => void;
  error: string | null;
  autoplay: boolean;
  setAutoplay: (v: boolean) => void;
  balance: number;
}

const SPEED_OPTIONS: AnimationSpeed[] = ['slow', 'regular', 'turbo'];

export function Controls({
  config,
  betAmount,
  setBetAmount,
  rows,
  setRows,
  riskLevel,
  setRiskLevel,
  animationSpeed,
  setAnimationSpeed,
  playing,
  onPlay,
  error,
  autoplay,
  setAutoplay,
  balance,
}: ControlsProps) {
  const rowsList = config?.rows ?? [8, 10, 12, 14];
  const riskList = config?.riskLevels ?? (['low', 'medium', 'high'] as RiskLevel[]);
  const minBet = config?.minBet ?? 0.1;
  const maxBet = config?.maxBet ?? 1000;
  const step = 0.1;

  const canBet = config && balance >= betAmount && betAmount >= minBet && betAmount <= maxBet && !playing;

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
              {r}
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

      <div className="control-group">
        <span className="control-label">Speed</span>
        <div className="row-selectors">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-secondary ${animationSpeed === s ? 'active-low' : ''}`}
              onClick={() => setAnimationSpeed(s)}
              disabled={playing}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="action-row">
        <button
          type="button"
          className={`btn btn-primary btn-play ${error === 'Insufficient balance' ? 'btn-shake' : ''}`}
          onClick={onPlay}
          disabled={!canBet && error !== 'Insufficient balance'}
        >
          {playing ? '...' : 'BET'}
        </button>
        
        <div className="autoplay-wrap">
          <span className="control-label" style={{ margin: 0 }}>Autoplay</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={autoplay}
              onChange={(e) => setAutoplay(e.target.checked)}
              disabled={playing}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  );
}
