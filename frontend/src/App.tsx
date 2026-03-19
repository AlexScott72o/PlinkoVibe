import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlinko, MIN_BALLS, MAX_BALLS } from './hooks/usePlinko';
import { useAuth } from './hooks/useAuth';
import { Board } from './components/Board';
import { Controls } from './components/Controls';
import { Stats } from './components/Stats';
import { SplashScreen } from './components/SplashScreen';
import { AuthModal } from './components/AuthModal';
import { CashierModal } from './components/CashierModal';
import { CURRENCY_SYMBOLS } from 'shared';
import {
  playPegBounce,
  playLanding,
  playWin,
  isMusicMuted,
  isSfxMuted,
  setMusicMuted,
  setSfxMuted,
  getBgmVolume,
  setBgmVolume,
  tryAutoplayBackgroundMusic,
  startBackgroundMusic,
} from './sound';

const SLOW_CONNECTION_THRESHOLD_S = 5;
const EXPECTED_WAKEUP_S = 60;

function App() {
  const auth = useAuth();

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
  } = usePlinko(auth, {
    onReveal: (result) => {
      if (result.winAmount > 0) playWin(result.winAmount, betAmount);
    },
  });

  const [musicMuted, setMusicMutedState] = useState(isMusicMuted);
  const [sfxMuted, setSfxMutedState] = useState(isSfxMuted);
  const [bgmVolume, setBgmVolumeState] = useState(getBgmVolume);
  const [showSplash, setShowSplash] = useState(true);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const audioMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [loadingElapsedS, setLoadingElapsedS] = useState(0);

  const isAppLoading = auth.status === 'loading' || loading;

  useEffect(() => {
    if (!isAppLoading) {
      setLoadingElapsedS(0);
      return;
    }
    const interval = setInterval(() => setLoadingElapsedS((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [isAppLoading]);

  const isSlowConnection = isAppLoading && loadingElapsedS >= SLOW_CONNECTION_THRESHOLD_S;

  const canBet =
    config &&
    balance >= totalBet &&
    betAmount >= (config?.minBet ?? 0.1) &&
    betAmount <= (config?.maxBet ?? 1000) &&
    numBalls >= MIN_BALLS &&
    numBalls <= MAX_BALLS &&
    !playing;

  useEffect(() => {
    setMusicMutedState(isMusicMuted());
    setSfxMutedState(isSfxMuted());
    setBgmVolumeState(getBgmVolume());
  }, []);

  useEffect(() => {
    if (!audioMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setAudioMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [audioMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountMenuOpen]);

  const setMusicMutedAndState = useCallback((muted: boolean) => {
    setMusicMuted(muted);
    setMusicMutedState(muted);
  }, []);

  const setSfxMutedAndState = useCallback((muted: boolean) => {
    setSfxMuted(muted);
    setSfxMutedState(muted);
  }, []);

  useEffect(() => {
    if (!isAppLoading) {
      tryAutoplayBackgroundMusic();
    }
  }, [isAppLoading]);

  const handlePlaceBet = () => {
    void placeBet();
  };

  const onPegHit = () => {
    playPegBounce();
  };

  const handleLand = (roundId: number) => {
    playLanding();
    onLand(roundId);
  };

  // FUN uses an emoji in CURRENCY_SYMBOLS ('🎮'); hide it in the game UI so we show just "FUN".
  const currencySymbol = auth.currency === 'FUN' ? '' : CURRENCY_SYMBOLS[auth.currency];

  if (isAppLoading) {
    const progressPct = Math.min(
      100,
      ((loadingElapsedS - SLOW_CONNECTION_THRESHOLD_S) / (EXPECTED_WAKEUP_S - SLOW_CONNECTION_THRESHOLD_S)) * 100,
    );
    return (
      <div className="app">
        <header className="header">
          <h1 className="logo-text">PlinkoVibe</h1>
        </header>
        <div className="loading">
          {!isSlowConnection ? (
            <p className="display-text">[ ESTABLISHING SECURE CONNECTION... ]</p>
          ) : (
            <div className="loading-slow">
              <p className="loading-slow-title">
                Server Waking Up
                <span className="loading-dots" aria-hidden="true">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              </p>
              <p className="loading-slow-body">
                The server is starting up from sleep — this can take up to a minute
                on the free tier. Please hang tight!
              </p>
              <div className="loading-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPct)}>
                <div className="loading-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="loading-elapsed">
                <span className="loading-elapsed-label">Waiting</span>
                <span className="loading-elapsed-value">{loadingElapsedS}s</span>
              </div>
              <p className="loading-slow-support">
                Enjoying the game? Help us upgrade to faster servers —{' '}
                <a
                  href="https://buymeacoffee.com/alexscott"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="loading-coffee-link"
                >
                  buy us a coffee ☕
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
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

          {/* Account menu */}
          <div className="account-menu-wrap" ref={accountMenuRef}>
            {auth.status === 'authenticated' ? (
              <button
                type="button"
                className="btn-account btn-account-logged-in"
                onClick={() => setAccountMenuOpen((o) => !o)}
                aria-label="Account menu"
                aria-expanded={accountMenuOpen}
                aria-haspopup="true"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className="account-username">{auth.username}</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-account btn-account-guest"
                onClick={() => setShowAuthModal(true)}
                aria-label="Log in or register"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>Log In</span>
              </button>
            )}

            {accountMenuOpen && auth.status === 'authenticated' && (
              <div className="account-dropdown" role="menu">
                <div className="account-dropdown-user">
                  <span className="caption-text">Logged in as</span>
                  <span className="account-dropdown-username">{auth.username}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="account-dropdown-item"
                  onClick={() => { setShowCashierModal(true); setAccountMenuOpen(false); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                  Cashier
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="account-dropdown-item account-dropdown-logout"
                  onClick={async () => { setAccountMenuOpen(false); await auth.logout(); }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Log Out
                </button>
              </div>
            )}
          </div>
        </div>

        <h1 className="logo-text">PlinkoVibe</h1>

        <div className="header-right">
          {/* Audio menu */}
          <div className="audio-control-wrap" ref={audioMenuRef}>
            <button
              type="button"
              className="btn-mute"
              onClick={() => setAudioMenuOpen((o) => !o)}
              aria-label="Sound settings"
              aria-expanded={audioMenuOpen}
              aria-haspopup="true"
            >
              {musicMuted && sfxMuted ? (
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
            {audioMenuOpen && (
              <div className="audio-menu" role="menu">
                <div className="audio-menu-item">
                  <span className="audio-menu-label">Background music</span>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!musicMuted}
                    className={`audio-menu-toggle ${musicMuted ? 'off' : 'on'}`}
                    onClick={() => setMusicMutedAndState(!musicMuted)}
                  >
                    {musicMuted ? 'Off' : 'On'}
                  </button>
                </div>
                <div className="audio-menu-item audio-menu-item-slider">
                  <span className="audio-menu-label">Music volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(bgmVolume * 100)}
                    onChange={(e) => {
                      const v = Number(e.target.value) / 100;
                      setBgmVolume(v);
                      setBgmVolumeState(v);
                    }}
                    className="audio-volume-slider"
                    aria-label="Music volume"
                  />
                </div>
                <div className="audio-menu-item">
                  <span className="audio-menu-label">Sound effects</span>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={!sfxMuted}
                    className={`audio-menu-toggle ${sfxMuted ? 'off' : 'on'}`}
                    onClick={() => setSfxMutedAndState(!sfxMuted)}
                  >
                    {sfxMuted ? 'Off' : 'On'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
                onClick={handlePlaceBet}
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
              <span className="caption-text">BALANCE ({auth.currency})</span>
              <span className="stat-value">{currencySymbol}{balance.toFixed(2)}</span>
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
            animationSpeed={animationSpeed}
            setAnimationSpeed={setAnimationSpeed}
            playing={playing}
            onPlay={handlePlaceBet}
            error={error}
            balance={balance}
            currency={auth.currency}
            currencySymbol={currencySymbol}
          />
        </aside>

        <aside className="stats-sidebar">
          <Stats
            balance={balance}
            lastResults={lastResults}
            currency={auth.currency}
            currencySymbol={currencySymbol}
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
              animationSpeed={animationSpeed}
              setAnimationSpeed={setAnimationSpeed}
              playing={playing}
              onPlay={handlePlaceBet}
              error={error}
              balance={balance}
              currency={auth.currency}
              currencySymbol={currencySymbol}
              hideBetButton
            />
            <Stats
              balance={balance}
              lastResults={lastResults}
              currency={auth.currency}
              currencySymbol={currencySymbol}
              hideBalance
            />
          </div>
        </aside>
      </main>

      {showSplash && (
        <SplashScreen
          onDismiss={() => {
            setShowSplash(false);
            if (!musicMuted) startBackgroundMusic();
          }}
        />
      )}

      {showAuthModal && (
        <AuthModal auth={auth} onClose={() => setShowAuthModal(false)} />
      )}

      {showCashierModal && auth.status === 'authenticated' && (
        <CashierModal auth={auth} onClose={() => setShowCashierModal(false)} />
      )}
    </div>
  );
}

export default App;
