import type { AnimationSpeed } from '@/hooks/usePlinko';

const SPEED_OPTIONS: AnimationSpeed[] = ['slow', 'regular', 'turbo'];

interface SettingsProps {
  animationSpeed: AnimationSpeed;
  setAnimationSpeed: (v: AnimationSpeed) => void;
  playing: boolean;
}

export function Settings({
  animationSpeed,
  setAnimationSpeed,
  playing,
}: SettingsProps) {
  return (
    <div className="settings-panel panel-overlay">
      <span className="caption-text">SETTINGS</span>
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
    </div>
  );
}
