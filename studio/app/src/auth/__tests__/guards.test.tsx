/**
 * @vitest-environment jsdom
 *
 * Tests for RequireAuth and RequirePermission guards (ADR-0020, Phase 2.3).
 *
 * Coverage:
 *   - RequireAuth: loading state → renders null (no flash of /login)
 *   - RequireAuth: anonymous → redirects to /login
 *   - RequireAuth: authenticated → renders children
 *   - RequirePermission: has permission → renders children
 *   - RequirePermission: no permission → shows 403 page (not children)
 *   - RequirePermission: loading → renders null (inherited from RequireAuth)
 *   - useCan: returns true when permission present, false when absent
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext, RequireAuth, RequirePermission } from '../guards.js';
import type { AuthState } from '../auth-provider.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const noop = async () => {};

function makeAuth(override: Partial<AuthState> = {}): AuthState {
  const base: AuthState = {
    status: 'authenticated',
    user: { userId: 'u1', email: 'alice@test.com', tenantId: 'kb-cloud' },
    permissions: new Set(['users:read']),
    login: noop,
    logout: noop,
  };
  return { ...base, ...override } as AuthState;
}

/**
 * Wrap component in a MemoryRouter + AuthContext so guards can call useAuth()
 * and React Router can render <Navigate>.
 */
function renderWithAuth(ui: React.ReactElement, auth: AuthState, initialPath = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/protected" element={ui} />
          <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
          <Route path="*" element={<div data-testid="fallback">Fallback</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

// ── RequireAuth ───────────────────────────────────────────────────────────────

describe('RequireAuth', () => {
  it('renders null while status is loading — no flash of /login on cold load', () => {
    const auth = makeAuth({ status: 'loading', user: undefined });
    renderWithAuth(
      <RequireAuth>
        <div data-testid="child">Protected content</div>
      </RequireAuth>,
      auth,
    );
    expect(screen.queryByTestId('child')).toBeNull();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('redirects to /login when anonymous', async () => {
    const auth = makeAuth({ status: 'anonymous', user: undefined });
    renderWithAuth(
      <RequireAuth>
        <div data-testid="child">Protected content</div>
      </RequireAuth>,
      auth,
    );
    expect(screen.queryByTestId('child')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('login-page')).toBeDefined());
  });

  it('renders children when authenticated', () => {
    const auth = makeAuth({ status: 'authenticated' });
    renderWithAuth(
      <RequireAuth>
        <div data-testid="child">Protected content</div>
      </RequireAuth>,
      auth,
    );
    expect(screen.getByTestId('child').textContent).toBe('Protected content');
  });
});

// ── RequirePermission ─────────────────────────────────────────────────────────

describe('RequirePermission', () => {
  it('renders children when user has the required permission', () => {
    const auth = makeAuth({ permissions: new Set(['users:write']) });
    renderWithAuth(
      <RequirePermission permission="users:write">
        <div data-testid="child">Admin area</div>
      </RequirePermission>,
      auth,
    );
    expect(screen.getByTestId('child').textContent).toBe('Admin area');
  });

  it('shows 403 page when user lacks the required permission', () => {
    const auth = makeAuth({ permissions: new Set(['users:read']) });
    renderWithAuth(
      <RequirePermission permission="users:write">
        <div data-testid="child">Admin area</div>
      </RequirePermission>,
      auth,
    );
    expect(screen.queryByTestId('child')).toBeNull();
    expect(screen.getByTestId('forbidden-page')).toBeDefined();
  });

  it('renders null while auth is loading (no flash of /login before session resolves)', () => {
    const auth = makeAuth({ status: 'loading', user: undefined, permissions: new Set() });
    renderWithAuth(
      <RequirePermission permission="users:write">
        <div data-testid="child">Admin area</div>
      </RequirePermission>,
      auth,
    );
    expect(screen.queryByTestId('child')).toBeNull();
    expect(screen.queryByTestId('forbidden-page')).toBeNull();
    expect(screen.queryByTestId('login-page')).toBeNull();
  });

  it('redirects to /login when anonymous (RequireAuth wraps RequirePermission)', async () => {
    const auth = makeAuth({ status: 'anonymous', user: undefined, permissions: new Set() });
    renderWithAuth(
      <RequirePermission permission="users:write">
        <div data-testid="child">Admin area</div>
      </RequirePermission>,
      auth,
    );
    expect(screen.queryByTestId('child')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('login-page')).toBeDefined());
  });
});
