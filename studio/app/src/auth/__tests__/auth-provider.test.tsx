/**
 * @vitest-environment jsdom
 *
 * Tests for AuthProvider and useAuth hook (ADR-0020, Phase 2.2).
 *
 * Coverage:
 *   - Mount: GET /api/auth/me → authenticated state (userId, email, tenantId)
 *   - Mount: GET /api/auth/me → 401 → anonymous state
 *   - Mount: GET /api/auth/permissions → permissions loaded into Set
 *   - login(email, password): POST /api/auth/login → state → authenticated
 *   - login fails: stays anonymous
 *   - logout(): POST /api/auth/logout → state → anonymous
 *   - auth:unauthenticated event → state → anonymous
 *   - No 'role' field in user (ADR-0020 CD-3)
 *   - localStorage.getItem('studio-user-role') NOT used (old fake auth removed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../auth-provider.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ME_RESPONSE = { userId: 'u1', email: 'alice@test.com', tenantId: 'kb-cloud' };
// Use string literals — test verifies behavior, not specific enum values.
const PERMS_RESPONSE = { permissions: ['users:read'] };

function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn((url: string) => {
    const match = Object.entries(responses).find(([k]) => url.includes(k));
    if (!match) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });
    }
    const [, { status, body }] = match;
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  });
}

// A test component that renders auth state for assertions.
function TestComponent() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      {auth.status === 'authenticated' && (
        <>
          <span data-testid="userId">{auth.user.userId}</span>
          <span data-testid="email">{auth.user.email}</span>
          <span data-testid="tenantId">{auth.user.tenantId}</span>
          {/* Must NOT render role */}
          {'role' in auth.user && <span data-testid="role">ROLE_LEAKED</span>}
        </>
      )}
      <span data-testid="permCount">{auth.permissions.size}</span>
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuthProvider initial load', () => {
  it('sets status=authenticated when /api/auth/me succeeds', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 200, body: ME_RESPONSE },
      '/api/auth/permissions': { status: 200, body: PERMS_RESPONSE },
    }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('loading');

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );

    expect(screen.getByTestId('userId').textContent).toBe('u1');
    expect(screen.getByTestId('email').textContent).toBe('alice@test.com');
    expect(screen.getByTestId('tenantId').textContent).toBe('kb-cloud');
    expect(screen.queryByTestId('role')).toBeNull(); // No role field
  });

  it('sets status=anonymous when /api/auth/me returns 401', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 401, body: { error: 'Unauthorized' } },
      '/api/auth/permissions': { status: 401, body: {} },
    }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous'),
    );
    expect(screen.getByTestId('permCount').textContent).toBe('0');
  });

  it('loads permissions into Set when authenticated', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 200, body: ME_RESPONSE },
      '/api/auth/permissions': {
        status: 200,
        body: { permissions: ['users:read', 'invites:read'] },
      },
    }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('permCount').textContent).toBe('2'),
    );
  });

  it('does NOT read localStorage.studio-user-role (old fake auth removed)', async () => {
    localStorage.setItem('studio-user-role', 'admin');
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 401, body: {} },
      '/api/auth/permissions': { status: 401, body: {} },
    }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous'),
    );
    // Status is anonymous despite localStorage having 'admin'
    expect(screen.getByTestId('status').textContent).toBe('anonymous');
  });
});

describe('login()', () => {
  it('transitions to authenticated on successful login', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 401, body: {} },
      '/api/auth/permissions': { status: 401, body: {} },
      '/api/auth/login': { status: 200, body: ME_RESPONSE },
    }));

    let authRef: ReturnType<typeof useAuth> | null = null;

    function Grabber() {
      authRef = useAuth();
      return <TestComponent />;
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous'),
    );

    // Override fetch for subsequent calls after login
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/login': { status: 200, body: ME_RESPONSE },
      '/api/auth/me': { status: 200, body: ME_RESPONSE },
      '/api/auth/permissions': { status: 200, body: PERMS_RESPONSE },
    }));

    await act(async () => {
      await authRef!.login('alice@test.com', 'Password123!');
    });

    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(screen.getByTestId('userId').textContent).toBe('u1');
  });

  it('stays anonymous when login POST returns 401', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 401, body: {} },
      '/api/auth/permissions': { status: 401, body: {} },
      '/api/auth/login': { status: 401, body: { error: 'invalid_credentials' } },
    }));

    let authRef: ReturnType<typeof useAuth> | null = null;

    function Grabber() {
      authRef = useAuth();
      return <TestComponent />;
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('anonymous'),
    );

    await expect(
      act(async () => { await authRef!.login('alice@test.com', 'wrong'); }),
    ).rejects.toBeDefined();

    expect(screen.getByTestId('status').textContent).toBe('anonymous');
  });
});

describe('logout()', () => {
  it('transitions to anonymous after logout', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 200, body: ME_RESPONSE },
      '/api/auth/permissions': { status: 200, body: PERMS_RESPONSE },
      '/api/auth/logout': { status: 200, body: { ok: true } },
    }));

    let authRef: ReturnType<typeof useAuth> | null = null;

    function Grabber() {
      authRef = useAuth();
      return <TestComponent />;
    }

    render(
      <AuthProvider>
        <Grabber />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );

    await act(async () => { await authRef!.logout(); });

    expect(screen.getByTestId('status').textContent).toBe('anonymous');
    expect(screen.getByTestId('permCount').textContent).toBe('0');
  });
});

describe('auth:unauthenticated event', () => {
  it('transitions to anonymous when event is dispatched', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/me': { status: 200, body: ME_RESPONSE },
      '/api/auth/permissions': { status: 200, body: PERMS_RESPONSE },
    }));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('auth:unauthenticated'));
    });

    expect(screen.getByTestId('status').textContent).toBe('anonymous');
    expect(screen.getByTestId('permCount').textContent).toBe('0');
  });
});
