interface SplashScreenProps {
  onDismiss: () => void;
}

export function SplashScreen({ onDismiss }: SplashScreenProps) {
  return (
    <div className="splash-overlay">
      <div className="splash-content">
        <h1 className="logo-text splash-logo">PlinkoVibe</h1>
        
        <div className="splash-instructions">
          <h2 className="heading-text">How to Play</h2>
          <ul>
            <li>
              <span className="step-number">1</span>
              <p><strong>Set your bet</strong> and choose the number of balls to drop.</p>
            </li>
            <li>
              <span className="step-number">2</span>
              <p><strong>Adjust Risk & Rows</strong> to change the multiplier distribution. Higher risk means bigger potential wins, but more chance of missing!</p>
            </li>
            <li>
              <span className="step-number">3</span>
              <p><strong>Hit Spin</strong> to release the balls and watch them bounce through the pegs.</p>
            </li>
            <li>
              <span className="step-number">4</span>
              <p><strong>Win multipliers</strong> based on which slot the balls land in at the bottom!</p>
            </li>
          </ul>
        </div>

        <button 
          className="btn btn-primary splash-btn"
          onClick={onDismiss}
        >
          Lets Play!
        </button>
      </div>
    </div>
  );
}
