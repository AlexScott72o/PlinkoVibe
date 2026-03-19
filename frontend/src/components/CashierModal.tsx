import { useState, useCallback } from 'react';
import type { Currency } from 'shared';
import { CURRENCIES, CURRENCY_SYMBOLS } from 'shared';
import type { AuthState } from '../hooks/useAuth.js';
import * as pamApi from '../pamApi.js';

interface CashierModalProps {
  onClose: () => void;
  auth: AuthState;
}

const PRESET_AMOUNTS = [10, 50, 100, 500];

const CURRENCY_LABELS: Record<Currency, string> = {
  FUN: 'FUN',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  CAD: 'Canadian Dollar',
};

export function CashierModal({ onClose, auth }: CashierModalProps) {
  const [depositCurrency, setDepositCurrency] = useState<Currency>('FUN');
  const [depositAmount, setDepositAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeposit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      const result = await pamApi.deposit(depositCurrency, amount);
      await auth.refreshWalletBalances();
      setSuccessMessage(
        `Deposited ${CURRENCY_SYMBOLS[depositCurrency]}${amount.toFixed(2)} ${depositCurrency}. New balance: ${CURRENCY_SYMBOLS[depositCurrency]}${result.balance.toFixed(2)}`
      );
      setDepositAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setSubmitting(false);
    }
  }, [depositCurrency, depositAmount, auth]);

  const balances = auth.walletBalances;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="cashier-modal panel-overlay"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cashier"
      >
        <div className="cashier-header">
          <h2 className="heading-text">Cashier</h2>
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
        </div>

        <div className="cashier-balances">
          <h3 className="cashier-section-title">Your Wallets</h3>
          <div className="cashier-wallet-list">
            {CURRENCIES.map((c) => (
              <div
                key={c}
                className={`cashier-wallet-row ${auth.currency === c ? 'cashier-wallet-active' : ''}`}
                onClick={() => auth.setCurrency(c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && auth.setCurrency(c)}
                aria-label={`Select ${c} wallet`}
              >
                <span className="cashier-wallet-symbol">{CURRENCY_SYMBOLS[c]}</span>
                <div className="cashier-wallet-info">
                  <span className="cashier-wallet-name">{CURRENCY_LABELS[c]}</span>
                  <span className="cashier-wallet-code">{c}</span>
                </div>
                <span className="cashier-wallet-balance">
                  {balances ? balances[c].toFixed(2) : '—'}
                </span>
                {auth.currency === c && (
                  <span className="cashier-wallet-active-badge">ACTIVE</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="cashier-deposit">
          <h3 className="cashier-section-title">Simulate Deposit</h3>
          <p className="cashier-deposit-note caption-text">
            This is a demo deposit — no real money is transferred.
          </p>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {successMessage && <div className="cashier-success" role="status">{successMessage}</div>}

          <form onSubmit={handleDeposit} noValidate>
            <div className="cashier-deposit-currency">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cashier-currency-btn ${depositCurrency === c ? 'cashier-currency-active' : ''}`}
                  onClick={() => setDepositCurrency(c)}
                  disabled={submitting}
                >
                  {CURRENCY_SYMBOLS[c]} {c}
                </button>
              ))}
            </div>

            <div className="cashier-deposit-presets">
              {PRESET_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className="cashier-preset-btn"
                  onClick={() => setDepositAmount(String(amount))}
                  disabled={submitting}
                >
                  {CURRENCY_SYMBOLS[depositCurrency]}{amount}
                </button>
              ))}
            </div>

            <div className="cashier-deposit-input-row">
              <span className="cashier-deposit-currency-symbol">{CURRENCY_SYMBOLS[depositCurrency]}</span>
              <input
                type="number"
                className="cashier-deposit-input auth-input"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min="0.01"
                max="1000000"
                step="0.01"
                placeholder="Amount"
                disabled={submitting}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary cashier-deposit-btn"
              disabled={submitting || !depositAmount}
            >
              {submitting ? (
                <span className="spin-loading" style={{ width: 18, height: 18, display: 'inline-block' }} aria-hidden="true" />
              ) : (
                `Deposit ${depositCurrency}`
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
