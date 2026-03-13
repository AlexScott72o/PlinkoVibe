import { useState, useCallback } from 'react';
import type { AuthState } from '../hooks/useAuth.js';

interface AuthModalProps {
  onClose: () => void;
  auth: AuthState;
}

type Tab = 'login' | 'register';

export function AuthModal({ onClose, auth }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (tab === 'register') {
      if (password !== confirmPassword) {
        setFormError('Passwords do not match');
        return;
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (tab === 'login') {
        await auth.login(username, password);
      } else {
        await auth.register(username, password);
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }, [tab, username, password, confirmPassword, auth, onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="auth-modal panel-overlay"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tab === 'login' ? 'Login' : 'Register'}
      >
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${tab === 'login' ? 'auth-tab-active' : ''}`}
            onClick={() => { setTab('login'); setFormError(null); }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`auth-tab ${tab === 'register' ? 'auth-tab-active' : ''}`}
            onClick={() => { setTab('register'); setFormError(null); }}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {formError && (
            <div className="auth-error" role="alert">{formError}</div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              type="text"
              className="auth-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete={tab === 'login' ? 'username' : 'new-password'}
              minLength={3}
              maxLength={20}
              required
              disabled={submitting}
              placeholder="3–20 characters"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
              disabled={submitting}
              placeholder="Min. 8 characters"
            />
          </div>

          {tab === 'register' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-confirm-password">Confirm Password</label>
              <input
                id="auth-confirm-password"
                type="password"
                className="auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={submitting}
                placeholder="Repeat your password"
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitting || !username || !password}
          >
            {submitting ? (
              <span className="spin-loading" aria-hidden="true" style={{ width: 18, height: 18, display: 'inline-block' }} />
            ) : tab === 'login' ? (
              'Log In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {tab === 'login' && (
          <p className="auth-footer-text">
            No account?{' '}
            <button type="button" className="auth-link" onClick={() => setTab('register')}>
              Register here
            </button>
          </p>
        )}
        {tab === 'register' && (
          <p className="auth-footer-text">
            Already have an account?{' '}
            <button type="button" className="auth-link" onClick={() => setTab('login')}>
              Log in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
