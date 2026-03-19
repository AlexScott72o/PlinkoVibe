import type { BetResponse, Currency } from 'shared';

interface StatsProps {
  balance: number;
  lastResults: BetResponse[];
  hideBalance?: boolean;
  currency?: Currency;
  currencySymbol?: string;
}

export function Stats({ balance, lastResults, hideBalance, currency = 'FUN', currencySymbol = '🎮' }: StatsProps) {
  return (
    <div className="stats-panel panel-overlay">
      {!hideBalance && (
        <div className="stat-box">
          <span className="caption-text">BALANCE ({currency})</span>
          <span className="stat-value">{currencySymbol}{balance.toFixed(2)}</span>
        </div>
      )}

      <div className="stat-box" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <span className="caption-text">RESULTS</span>
        <ul className="results-list">
          {lastResults.length === 0 ? (
            <li className="body-text" style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>—</li>
          ) : (
            lastResults.map((r, i) => (
              <li key={i} className="result-item">
                <span className="body-text">{r.multiplier}x</span>
                <span className={r.winAmount > 0 ? 'stat-value win' : 'stat-value'}>
                  {r.winAmount > 0 ? `+${r.winAmount.toFixed(2)}` : r.winAmount.toFixed(2)}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
