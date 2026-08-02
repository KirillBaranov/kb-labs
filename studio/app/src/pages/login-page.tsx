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
import { Building2, Lock } from 'lucide-react';
import { UIButton, UIInput, UIInputPassword } from '@kb-labs/studio-ui-kit';
import { useAuth } from '@/auth/auth-provider';
import styles from './login-page.module.css';

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
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = React.useState(false);

  // Minimal client-side check — the server is the source of truth for
  // credential validity, this is just fast feedback before a round-trip.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validate = (candidateEmail: string, candidatePassword: string) => {
    const errors: { email?: string; password?: string } = {};
    if (!candidateEmail.trim()) {
      errors.email = 'Email is required';
    } else if (!EMAIL_RE.test(candidateEmail)) {
      errors.email = 'Enter a valid email address';
    }
    if (!candidatePassword) {
      errors.password = 'Password is required';
    }
    return errors;
  };

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

    const errors = validate(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      return;
    }

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
    <div className={styles.screen}>
      <div className={styles.card}>
        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.mark} aria-hidden="true">
            KB
          </div>
          <div>
            <p className={styles.title}>KB Labs Studio</p>
            <p className={styles.subtitle}>AI/infra control plane</p>
          </div>
        </div>

        <h1 className={styles.heading}>Welcome back</h1>
        <p className={styles.lede}>
          Access is invite-only — ask your workspace admin for credentials.
        </p>

        {/* Password form */}
        {showPasswordForm && (
          <form
            aria-label="login form"
            onSubmit={(e) => { void handleSubmit(e); }}
            noValidate
          >
            {/* Email field */}
            <div className={styles.field}>
              <label htmlFor="login-email" className={styles.label}>
                Email
              </label>
              <UIInput
                id="login-email"
                type="email"
                autoComplete="email"
                required
                size="large"
                status={fieldErrors.email ? 'error' : undefined}
                value={email}
                onChange={(value) => {
                  setEmail(value);
                  if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                }}
              />
              {fieldErrors.email && <p className={styles.fieldError}>{fieldErrors.email}</p>}
            </div>

            {/* Password field */}
            <div className={styles.field}>
              <label htmlFor="login-password" className={styles.label}>
                Password
              </label>
              <UIInputPassword
                id="login-password"
                autoComplete="current-password"
                required
                size="large"
                status={fieldErrors.password ? 'error' : undefined}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              {fieldErrors.password && <p className={styles.fieldError}>{fieldErrors.password}</p>}
            </div>

            {/* Error message */}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}

            {/* Submit */}
            <UIButton
              htmlType="submit"
              variant="primary"
              size="large"
              loading={loading}
              className={styles.submit}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </UIButton>
          </form>
        )}

        {/* Divider between password form and redirect providers */}
        {showPasswordForm && (
          <div aria-hidden="true" className={styles.divider}>
            or
          </div>
        )}

        {/* Redirect (OAuth/OIDC) providers */}
        {redirectProviders.map((p) => (
          <a
            key={p.id}
            href={`/api/auth/oauth/${p.id}/start`}
            className={styles.providerLink}
          >
            <Building2 size={16} aria-hidden="true" />
            Continue with {p.id}
          </a>
        ))}

        {/* SSO — planned, not wired up yet: shown disabled to signal the
            upcoming corporate-identity login path (Okta/Azure AD/etc). */}
        <button
          type="button"
          disabled
          className={styles.providerLinkDisabled}
          title="Coming soon"
        >
          <Building2 size={16} aria-hidden="true" />
          Continue with corporate SSO
          <span className={styles.soonBadge}>
            <Lock size={10} aria-hidden="true" />
            Soon
          </span>
        </button>
      </div>
    </div>
  );
}
