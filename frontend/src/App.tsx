import { useState, useEffect } from 'react';
import { usePlinko } from './hooks/usePlinko';
import { Board } from './components/Board';
import { Controls } from './components/Controls';
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
    lastOutcome,
    loading,
    error,
    playing,
    placeBet,
    autoplay,
    setAutoplay,
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
        <p className="loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <img src="/plinko-logo.png" alt="PlinkoVibe" className="logo-img" />
        <button
          type="button"
          className="btn-mute"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </header>
      <main className="main">
        <Board
          rows={rows}
          riskLevel={riskLevel}
          paytables={config?.paytables ?? {}}
          resultSlotIndex={lastOutcome?.slotIndex ?? null}
          onPegHit={onPegHit}
          onLand={onLand}
        />
        <Controls
          config={config}
          balance={balance}
          betAmount={betAmount}
          setBetAmount={setBetAmount}
          rows={rows}
          setRows={setRows}
          riskLevel={riskLevel}
          setRiskLevel={setRiskLevel}
          lastWin={lastOutcome?.winAmount ?? null}
          playing={playing}
          onPlay={placeBet}
          error={error}
          autoplay={autoplay}
          setAutoplay={setAutoplay}
        />
      </main>
    </div>
  );
}

export default App;
