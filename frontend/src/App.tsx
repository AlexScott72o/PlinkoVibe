import { useState, useEffect } from 'react';
import { usePlinko, MIN_BALLS, MAX_BALLS } from './hooks/usePlinko';
import { Board } from './components/Board';
import { Controls } from './components/Controls';
import { Stats } from './components/Stats';
import { Settings } from './components/Settings';
import { playPegBounce, playLanding, playWin, isMuted, setMuted } from './sound';

function App() {
  const {
    balance,
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
    animationSpeed,
    setAnimationSpeed,
    animationDurationMs,
    activeBalls,
    onLand,
    onBallComplete,
    lastResults,
    loading,
    error,
    playing,
    placeBet,
  } = usePlinko({
    onReveal: (result) => {
      if (result.winAmount > 0) playWin(result.winAmount, betAmount);
    },
  });

  const [muted, setMutedState] = useState(isMuted);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const canBet =
    config &&
    balance >= totalBet &&
    betAmount >= (config?.minBet ?? 0.1) &&
    betAmount <= (config?.maxBet ?? 1000) &&
    numBalls >= MIN_BALLS &&
    numBalls <= MAX_BALLS &&
    !playing;

  useEffect(() => {
    setMutedState(isMuted());
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const onPegHit = () => {
    playPegBounce();
  };

  const handleLand = (roundId: number) => {
    playLanding();
    onLand(roundId);
  };

  if (loading) {
    return (
      <div className="app">
        <header className="header">
          <h1 className="logo-text">PlinkoVibe</h1>
        </header>
        <div className="loading">
          <p className="display-text">[ ESTABLISHING SECURE RGS CONNECTION... ]</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <button
          type="button"
          className="mobile-menu-toggle header-icon-left"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open settings"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <h1 className="logo-text">PlinkoVibe</h1>
        <button
          type="button"
          className="btn-mute"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
            </svg>
          )}
        </button>
      </header>
      <main className="main">
        <section className="board-hero">
          {error && error !== 'Insufficient balance' && error !== 'Bet out of range' && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div className="warning-icon">⚠</div>
                <h3 className="heading-text">Connection Lost</h3>
                <p className="body-text">{error}</p>
                <p className="caption-text">Reconnecting to RGS...</p>
              </div>
            </div>
          )}
          <Board
            rows={rows}
            riskLevel={riskLevel}
            paytables={config?.paytables ?? {}}
            activeBalls={activeBalls}
            animationDurationMs={animationDurationMs}
            onBallComplete={onBallComplete}
            onPegHit={onPegHit}
            onLand={handleLand}
          />
          <div className="mobile-bet-row">
            <div className="action-row-buttons">
              <button
                type="button"
                className="btn-bet-adjust btn-bet-adjust-inline"
                onClick={() => setBetAmount(Math.max(config?.minBet ?? 0.1, betAmount - 0.1))}
                disabled={playing}
                aria-label="Decrease bet"
              >
                −
              </button>
              <button
                type="button"
                className={`btn btn-primary btn-play btn-spin-icon ${error === 'Insufficient balance' ? 'btn-shake' : ''}`}
                onClick={placeBet}
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
                onClick={() => setBetAmount(Math.min(config?.maxBet ?? 1000, betAmount + 0.1))}
                disabled={playing}
                aria-label="Increase bet"
              >
                +
              </button>
            </div>
            <span className="play-bet-amount">
              BET {Number.isInteger(totalBet) ? totalBet : totalBet.toFixed(2)}
            </span>
            <div className="mobile-balance">
              <span className="caption-text">BALANCE (FUN)</span>
              <span className="stat-value">{balance.toFixed(2)}</span>
            </div>
          </div>
        </section>

        <aside className="controls-sidebar">
          <Controls
            config={config}
            betAmount={betAmount}
            setBetAmount={setBetAmount}
            numBalls={numBalls}
            setNumBalls={setNumBalls}
            totalBet={totalBet}
            rows={rows}
            setRows={setRows}
            riskLevel={riskLevel}
            setRiskLevel={setRiskLevel}
            playing={playing}
            onPlay={placeBet}
            error={error}
            balance={balance}
          />
        </aside>

        <aside className="stats-sidebar">
          <Settings
            animationSpeed={animationSpeed}
            setAnimationSpeed={setAnimationSpeed}
            playing={playing}
          />
          <Stats
            balance={balance}
            lastResults={lastResults}
          />
        </aside>

        <div
          className={`mobile-drawer-backdrop ${mobileMenuOpen ? 'open' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
        <aside className={`mobile-drawer ${mobileMenuOpen ? 'open' : ''}`}>
          <div className="mobile-drawer-header">
            <h2 className="heading-text">Settings</h2>
            <button
              type="button"
              className="mobile-drawer-close"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close settings"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="mobile-drawer-content">
            <Controls
              config={config}
              betAmount={betAmount}
              setBetAmount={setBetAmount}
              numBalls={numBalls}
              setNumBalls={setNumBalls}
              totalBet={totalBet}
              rows={rows}
              setRows={setRows}
              riskLevel={riskLevel}
              setRiskLevel={setRiskLevel}
              playing={playing}
              onPlay={placeBet}
              error={error}
              balance={balance}
              hideBetButton
            />
            <Settings
              animationSpeed={animationSpeed}
              setAnimationSpeed={setAnimationSpeed}
              playing={playing}
            />
            <Stats
              balance={balance}
              lastResults={lastResults}
              hideBalance
            />
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
