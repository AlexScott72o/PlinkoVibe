import { useState, useEffect } from 'react';
import { usePlinko } from './hooks/usePlinko';
import { Board } from './components/Board';
import { Controls } from './components/Controls';
import { Stats } from './components/Stats';
import { TestingSection } from './components/TestingSection';
import { playPegBounce, playLanding, playWin, isMuted, setMuted } from './sound';

function App() {
  const {
    balance,
    config,
    betAmount,
    setBetAmount,
    rows,
    setRows,
    riskLevel,
    setRiskLevel,
    animationSpeed,
    setAnimationSpeed,
    animationDurationMs,
    lastOutcome,
    activeBalls,
    onBallComplete,
    lastResults,
    loading,
    error,
    playing,
    placeBet,
  } = usePlinko();

  const [muted, setMutedState] = useState(isMuted);

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

  const onLand = () => {
    playLanding();
    if (lastOutcome && lastOutcome.winAmount > 0) {
      playWin(lastOutcome.winAmount, betAmount);
    }
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
        <aside className="controls-sidebar">
          <Controls
            config={config}
            betAmount={betAmount}
            setBetAmount={setBetAmount}
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
            onLand={onLand}
          />
        </section>
        
        <aside className="stats-sidebar">
          <TestingSection
            animationSpeed={animationSpeed}
            setAnimationSpeed={setAnimationSpeed}
            playing={playing}
          />
          <Stats
            balance={balance}
            lastResults={lastResults}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
