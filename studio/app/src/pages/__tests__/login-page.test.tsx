/**
 * @vitest-environment jsdom
 *
 * Tests for LoginPage (ADR-0020, Phase 2.4).
 *
 * Coverage:
 *   - Mounts with email + password fields (no workspace/role field)
 *   - Submit calls auth.login(email, password)
 *   - Submit button is disabled while login is in-flight
 *   - Successful login → navigates to /
 *   - Failed login → shows "Invalid credentials" error message
 *   - Shows provider-based form (email-password kind)
 *   - No role selector (old fake auth removed)
 *   - Redirect (OAuth/OIDC) providers render a "Continue with {id}" link
 *     pointing at the gateway start endpoint (ADR-0020, Step 6)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../auth/guards.js';
import type { AuthState } from '../../auth/auth-provider.js';

// ── Lazy import to allow vi.stubGlobal before module loads ────────────────────
// We import the component after setting up mocks so the component's
// module-level fetch is the stubbed version.
async function importLoginPage() {
  const { LoginPage } = await import('../login-page.js');
  return LoginPage;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROVIDERS_RESPONSE = [{ id: 'email-password', kind: 'password' }];

function mockFetchProviders(loginResult: 'ok' | 'fail') {
  return mockFetchWithProviders(PROVIDERS_RESPONSE);
}

// Generic provider-list stub: serves the given providers array from
// GET /api/auth/providers, 404 for anything else.
function mockFetchWithProviders(providers: Array<{ id: string; kind: string }>) {
  return vi.fn((url: string) => {
    if (url.includes('/api/auth/providers')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(providers),
      });
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });
  });
}

function makeAnonymousAuth(loginFn: (email: string, password: string) => Promise<void>): AuthState {
  return {
    status: 'anonymous',
    permissions: new Set(),
    login: loginFn,
    logout: async () => {},
  } as AuthState;
}

function renderLoginPage(LoginPage: React.ComponentType, auth: AuthState) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  it('renders email and password fields (no role selector)', async () => {
    vi.stubGlobal('fetch', mockFetchProviders('ok'));
    const LoginPage = await importLoginPage();
    const login = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(LoginPage, makeAnonymousAuth(login));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeDefined());

    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    // Must NOT have a role selector (CD-3 — no role on frontend)
    expect(screen.queryByText(/viewer|operator|admin/i)).toBeNull();
  });

  it('calls auth.login with email and password on submit', async () => {
    vi.stubGlobal('fetch', mockFetchProviders('ok'));
    const LoginPage = await importLoginPage();
    const login = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(LoginPage, makeAnonymousAuth(login));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeDefined());

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'alice@test.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'Secret123!' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /login form/i }));
    });

    expect(login).toHaveBeenCalledWith('alice@test.com', 'Secret123!');
  });

  it('disables submit button while login is in-flight', async () => {
    vi.stubGlobal('fetch', mockFetchProviders('ok'));
    const LoginPage = await importLoginPage();

    let resolveLogin: () => void;
    const login = vi.fn(
      () => new Promise<void>((resolve) => { resolveLogin = resolve; }),
    );
    renderLoginPage(LoginPage, makeAnonymousAuth(login));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeDefined());

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });

    act(() => {
      fireEvent.submit(screen.getByRole('form', { name: /login form/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in|signing in/i }).getAttribute('disabled')).not.toBeNull(),
    );

    // Resolve and confirm button re-enables
    await act(async () => { resolveLogin!(); });
  });

  it('shows "Invalid credentials" error when login fails', async () => {
    vi.stubGlobal('fetch', mockFetchProviders('fail'));
    const LoginPage = await importLoginPage();
    const login = vi.fn().mockRejectedValue(
      Object.assign(new Error('invalid_credentials'), { status: 401 }),
    );
    renderLoginPage(LoginPage, makeAnonymousAuth(login));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeDefined());

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'x@y.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /login form/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/invalid credentials/i)).toBeDefined(),
    );
  });

  it('navigates to / after successful login', async () => {
    vi.stubGlobal('fetch', mockFetchProviders('ok'));
    const LoginPage = await importLoginPage();
    const login = vi.fn().mockResolvedValue(undefined);
    renderLoginPage(LoginPage, makeAnonymousAuth(login));

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeDefined());

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'alice@test.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pass' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /login form/i }));
    });

    await waitFor(() => expect(screen.getByTestId('home-page')).toBeDefined());
  });

  // ── Redirect (OAuth/OIDC) providers ──────────────────────────────────────────

  it('renders a "Continue with {id}" link for a redirect provider', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWithProviders([
        { id: 'email-password', kind: 'password' },
        { id: 'corp', kind: 'redirect' },
      ]),
    );
    const LoginPage = await importLoginPage();
    renderLoginPage(LoginPage, makeAnonymousAuth(vi.fn()));

    const link = await screen.findByRole('link', { name: /continue with corp/i });
    // The link points the browser at the gateway start endpoint, which issues
    // a 302 to the upstream IdP. A plain anchor is enough — no JS navigation.
    expect(link.getAttribute('href')).toBe('/api/auth/oauth/corp/start');
  });

  it('shows redirect buttons alongside the password form when both exist', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWithProviders([
        { id: 'email-password', kind: 'password' },
        { id: 'corp', kind: 'redirect' },
      ]),
    );
    const LoginPage = await importLoginPage();
    renderLoginPage(LoginPage, makeAnonymousAuth(vi.fn()));

    await screen.findByRole('link', { name: /continue with corp/i });
    // Password form is still present.
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
  });

  it('hides the password form when only redirect providers are configured', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWithProviders([{ id: 'corp', kind: 'redirect' }]),
    );
    const LoginPage = await importLoginPage();
    renderLoginPage(LoginPage, makeAnonymousAuth(vi.fn()));

    await screen.findByRole('link', { name: /continue with corp/i });
    // No password form when there's no password provider.
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('renders one link per redirect provider', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchWithProviders([
        { id: 'corp', kind: 'redirect' },
        { id: 'google', kind: 'redirect' },
      ]),
    );
    const LoginPage = await importLoginPage();
    renderLoginPage(LoginPage, makeAnonymousAuth(vi.fn()));

    const corp = await screen.findByRole('link', { name: /continue with corp/i });
    const google = await screen.findByRole('link', { name: /continue with google/i });
    expect(corp.getAttribute('href')).toBe('/api/auth/oauth/corp/start');
    expect(google.getAttribute('href')).toBe('/api/auth/oauth/google/start');
  });
});
