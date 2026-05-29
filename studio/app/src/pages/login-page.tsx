/**
 * @module @kb-labs/studio-app/pages/login-page
 *
 * Real login page for Studio (ADR-0020, Phase 2.4).
 *
 * Replaces the old fake role-select login placeholder.
 *
 * Behaviour:
 *   - On mount: GET /api/auth/providers to discover available providers.
 *   - For providers with kind='password': renders an email + password form.
 *   - For providers with kind='redirect' (OAuth/OIDC): renders a
 *     "Continue with {id}" link pointing at /api/auth/oauth/{id}/start.
 *     The link is a plain anchor — the gateway start endpoint replies with a
 *     302 to the upstream IdP, so a full-page navigation is exactly right
 *     (no JS, no fetch — the browser must follow cross-site redirects).
 *   - Submit: calls auth.login(email, password) from the AuthContext.
 *   - Success: navigates to /.
 *   - Failure: shows "Invalid credentials" (single message — never reveals
 *     which field was wrong, per CD-8).
 *   - Submit button is disabled while the request is in-flight.
 *   - No workspace/tenant field — tenant is resolved from the subdomain.
 *   - No role selector — roles are server-side only (CD-3).
 */

import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/auth-provider';

// ── Provider types ────────────────────────────────────────────────────────────

interface AuthProvider {
  id: string;
  kind: 'password' | string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  // Destination after successful auth: the protected page that redirected here
  // (passed via React Router state by RequireAuth), or '/' as fallback.
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  const { login } = auth;

  const [providers, setProviders] = React.useState<AuthProvider[]>([]);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Auto-navigate when auth resolves to authenticated (handles transparent
  // token refresh: RequireAuth sends the user here while loading, auth-provider
  // completes the refresh in the background, then we go back to `from`).
  React.useEffect(() => {
    if (auth.status === 'authenticated') {
      navigate(from, { replace: true });
    }
  }, [auth.status, navigate, from]);

  // Load available providers on mount.
  React.useEffect(() => {
    fetch('/api/auth/providers', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((data: unknown) => {
        // The gateway returns `{ providers: [...] }` (see gateway user-routes
        // GET /auth/providers). Accept that canonical shape, and also tolerate
        // a bare array for forward/backward compatibility.
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as { providers?: unknown })?.providers)
            ? (data as { providers: unknown[] }).providers
            : [];
        setProviders(list as AuthProvider[]);
      })
      .catch(() => {
        // Providers endpoint is best-effort; default to showing password form.
        setProviders([{ id: 'email-password', kind: 'password' }]);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  // Show password form if any provider has kind='password', or if providers
  // haven't loaded yet (default to password form so the page isn't blank).
  const showPasswordForm =
    providers.length === 0 || providers.some((p) => p.kind === 'password');

  // Redirect (OAuth/OIDC) providers render as "Continue with {id}" links.
  const redirectProviders = providers.filter((p) => p.kind === 'redirect');

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
        {/* Heading */}
        <h1 style={{ marginBottom: '0.25rem', fontSize: '1.5rem', fontWeight: 600 }}>
          KB Labs Studio
        </h1>
        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary, #666)', fontSize: '0.9rem' }}>
          Sign in to your workspace
        </p>

        {/* Password form */}
        {showPasswordForm && (
          <form
            aria-label="login form"
            onSubmit={(e) => { void handleSubmit(e); }}
            noValidate
          >
            {/* Email field */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="login-email"
                style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500 }}
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

            {/* Password field */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="login-password"
                style={{ display: 'block', marginBottom: '0.375rem', fontWeight: 500 }}
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
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
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* Divider between password form and redirect providers */}
        {showPasswordForm && redirectProviders.length > 0 && (
          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              margin: '1.25rem 0',
              color: 'var(--text-secondary, #999)',
              fontSize: '0.8rem',
            }}
          >
            <span style={{ flex: 1, height: '1px', background: 'var(--border-primary, #e5e5e5)' }} />
            or
            <span style={{ flex: 1, height: '1px', background: 'var(--border-primary, #e5e5e5)' }} />
          </div>
        )}

        {/* Redirect (OAuth/OIDC) providers */}
        {redirectProviders.map((p) => (
          <a
            key={p.id}
            href={`/api/auth/oauth/${p.id}/start`}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.7rem',
              marginBottom: '0.625rem',
              borderRadius: '6px',
              background: 'var(--bg-secondary, #f0f0f0)',
              color: 'var(--text-primary, #333)',
              fontWeight: 600,
              fontSize: '0.95rem',
              textAlign: 'center',
              textDecoration: 'none',
              border: '1px solid var(--border-primary, #d9d9d9)',
              boxSizing: 'border-box',
            }}
          >
            Continue with {p.id}
          </a>
        ))}
      </div>
    </div>
  );
}
