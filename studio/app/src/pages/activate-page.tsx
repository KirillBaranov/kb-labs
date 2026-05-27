/**
 * @module @kb-labs/studio-app/pages/activate-page
 *
 * Invite activation page (ADR-0020, Phase 2.5).
 *
 * Flow:
 *   /activate/:token → user sets a password → POST /api/auth/activate
 *   → success: history.replaceState (strip token from URL) → navigate /
 *   → error: show message
 *
 * Security:
 *   - <meta name="referrer" content="no-referrer"> prevents the token from
 *     leaking in Referer headers when the user clicks an external link.
 *   - After success, history.replaceState replaces the URL so the token is
 *     no longer in the browser history.
 */

import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function ActivatePage() {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();

  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Inject no-referrer meta tag to prevent token leaking via Referer headers.
  React.useEffect(() => {
    const existing = document.querySelector('meta[name="referrer"]');
    if (existing) return;

    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (body.error === 'invalid_invite') {
          setError('This invite link is invalid or expired');
        } else {
          setError(body.error ?? 'Activation failed');
        }
        return;
      }

      // Strip the activation token from the URL so it does not linger in
      // browser history (user may share or screenshot the history).
      window.history.replaceState({}, '', '/');
      navigate('/');
    } catch {
      setError('Activation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-tertiary, #f5f5f5)',
        padding: '2rem',
      }}
    >
      <div
        style={{
          maxWidth: '400px',
          width: '100%',
          background: 'var(--bg-primary, #fff)',
          borderRadius: '12px',
          padding: '2.5rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        }}
      >
        <h1 style={{ marginBottom: '0.25rem', fontSize: '1.5rem', fontWeight: 600 }}>
          Set your password
        </h1>
        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary, #666)', fontSize: '0.9rem' }}>
          Choose a password to activate your account.
        </p>

        <form
          aria-label="activate form"
          onSubmit={(e) => { void handleSubmit(e); }}
          noValidate
        >
          {/* Password */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="activate-password"
              style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500 }}
            >
              Password
            </label>
            <input
              id="activate-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-primary, #d9d9d9)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Confirm password */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="activate-confirm"
              style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500 }}
            >
              Confirm password
            </label>
            <input
              id="activate-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-primary, #d9d9d9)',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Error message */}
          {error && (
            <p
              role="alert"
              style={{
                color: 'var(--color-error, #ff4d4f)',
                marginBottom: '1rem',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.7rem',
              borderRadius: '6px',
              background: loading ? '#aaa' : 'var(--color-primary, #667eea)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.95rem',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Activating…' : 'Activate account'}
          </button>
        </form>
      </div>
    </div>
  );
}
