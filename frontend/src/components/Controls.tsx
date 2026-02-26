import type { ConfigResponse, RiskLevel } from 'shared';

interface ControlsProps {
  config: ConfigResponse | null;
  balance: number;
  betAmount: number;
  setBetAmount: (v: number) => void;
  rows: number;
  setRows: (v: number) => void;
  riskLevel: RiskLevel;
  setRiskLevel: (v: RiskLevel) => void;
  lastWin: number | null;
  playing: boolean;
  onPlay: () => void;
  error: string | null;
  autoplay: boolean;
  setAutoplay: (v: boolean) => void;
}

export function Controls({
  config,
  balance,
  betAmount,
  setBetAmount,
  rows,
  setRows,
  riskLevel,
  setRiskLevel,
  lastWin,
  playing,
  onPlay,
  error,
  autoplay,
  setAutoplay,
}: ControlsProps) {
  const rowsList = config?.rows ?? [8, 10, 12, 14];
  const riskList = config?.riskLevels ?? (['low', 'medium', 'high'] as RiskLevel[]);
  const minBet = config?.minBet ?? 0.1;
  const maxBet = config?.maxBet ?? 1000;
  const step = 0.1;

  const canBet = config && balance >= betAmount && betAmount >= minBet && betAmount <= maxBet && !playing;

  return (
    <div className="controls">
      {error && <div className="error-msg">{error}</div>}
      <div className="balance-row">
        <span className="balance-label">BALANCE (FUN)</span>
        <span className="balance-value">{balance.toFixed(2)}</span>
      </div>
      {lastWin !== null && lastWin > 0 && (
        <div className="last-win">+{lastWin.toFixed(2)}</div>
      )}
      <div className="bet-row">
        <button
          type="button"
          className="btn btn-bet"
          onClick={() => setBetAmount(Math.max(minBet, betAmount - step))}
          disabled={playing}
        >
          −
        </button>
        <span className="bet-value">FUN {betAmount.toFixed(2)}</span>
        <button
          type="button"
          className="btn btn-bet"
          onClick={() => setBetAmount(Math.min(maxBet, betAmount + step))}
          disabled={playing}
        >
          +
        </button>
      </div>
      <div className="risk-row">
        <span className="label">Risk</span>
        {riskList.map((r) => (
          <button
            key={r}
            type="button"
            className={`btn btn-risk ${riskLevel === r ? 'active' : ''}`}
            onClick={() => setRiskLevel(r)}
            disabled={playing}
          >
            {r.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="rows-row">
        <span className="label">Rows</span>
        {rowsList.map((r) => (
          <button
            key={r}
            type="button"
            className={`btn btn-rows ${rows === r ? 'active' : ''}`}
            onClick={() => setRows(r)}
            disabled={playing}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="play-row">
        <button
          type="button"
          className="btn btn-play"
          onClick={onPlay}
          disabled={!canBet}
          aria-label="Place bet"
        >
          {playing ? '…' : '▶'}
        </button>
        <label className="autoplay-label">
          <input
            type="checkbox"
            checked={autoplay}
            onChange={(e) => setAutoplay(e.target.checked)}
            disabled={playing}
          />
          Auto
        </label>
      </div>
    </div>
  );
}
