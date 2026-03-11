interface DebugPanelProps {
  debugMode: boolean;
  setDebugMode: (on: boolean) => void;
  pauseOnPegHit: boolean;
  setPauseOnPegHit: (on: boolean) => void;
  debugPaused: boolean;
  onResume: () => void;
}

export function DebugPanel({
  debugMode,
  setDebugMode,
  pauseOnPegHit,
  setPauseOnPegHit,
  debugPaused,
  onResume,
}: DebugPanelProps) {
  return (
    <div className="debug-panel panel-overlay">
      <span className="caption-text">DEBUG</span>
      <div className="control-group">
        <label className="control-row control-row-inline">
          <input
            type="checkbox"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
            aria-label="Debug mode"
          />
          <span className="control-label">Debug mode</span>
        </label>
      </div>
      {debugMode && (
        <>
          <div className="control-group">
            <label className="control-row control-row-inline">
              <input
                type="checkbox"
                checked={pauseOnPegHit}
                onChange={(e) => setPauseOnPegHit(e.target.checked)}
                aria-label="Pause on each peg hit"
              />
              <span className="control-label">Pause on peg hit</span>
            </label>
          </div>
          {pauseOnPegHit && (
            <div className="control-group">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onResume}
                disabled={!debugPaused}
                aria-label="Resume animation"
              >
                Resume
              </button>
              {debugPaused && (
                <p className="caption-text" style={{ marginTop: 4 }}>
                  Paused at peg hit — take a screenshot, then click Resume.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
