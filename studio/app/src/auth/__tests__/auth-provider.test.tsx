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
  // cleanup() is called globally by vitest-setup.ts
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

  it('sends X-CSRF-Token header on logout (double-submit CSRF)', async () => {
    const fakeCsrf = 'test-csrf-token-abc123';
    const logoutHeaders: Record<string, string>[] = [];

    const mockF = vi.fn((url: string, init?: RequestInit) => {
      // Capture headers on the logout call to verify CSRF injection.
      if (String(url).includes('/logout')) {
        logoutHeaders.push((init?.headers as Record<string, string>) ?? {});
      }
      const body = String(url).includes('/me')
        ? ME_RESPONSE
        : String(url).includes('/permissions')
          ? PERMS_RESPONSE
          : { ok: true };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }) as unknown as typeof fetch;

    vi.stubGlobal('fetch', mockF);

    let authRef: ReturnType<typeof useAuth> | null = null;
    function Grabber() { authRef = useAuth(); return <TestComponent />; }

    // _getCookie injects a known CSRF token for testing.
    render(
      <AuthProvider _getCookie={(name) => name === 'kb_csrf' ? fakeCsrf : undefined}>
        <Grabber />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );

    await act(async () => { await authRef!.logout(); });

    expect(logoutHeaders, 'logout was never called').toHaveLength(1);
    expect(
      logoutHeaders[0]?.['X-CSRF-Token'],
      'X-CSRF-Token header must be set on logout',
    ).toBe(fakeCsrf);
  });
});

describe('auth:unauthenticated event — loading guard', () => {
  it('ignores the event while status is loading (prevents premature /login redirect)', async () => {
    // Never resolve /api/auth/me — keeps status in 'loading' indefinitely.
    let resolveMe!: (v: unknown) => void;
    const neverResolve = vi.fn((url: string) => {
      if (url.includes('/api/auth/me')) {
        return new Promise((res) => { resolveMe = res; });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal('fetch', neverResolve);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    // Status must be 'loading' while fetch hangs.
    expect(screen.getByTestId('status').textContent).toBe('loading');

    // Fire auth:unauthenticated — must be ignored during loading.
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:unauthenticated'));
    });

    // Still loading (not bounced to anonymous).
    expect(screen.getByTestId('status').textContent).toBe('loading');

    // Now resolve the fetch — should authenticate normally.
    await act(async () => {
      resolveMe({
        ok: true,
        status: 200,
        json: () => Promise.resolve(ME_RESPONSE),
      });
    });

    // The stub for permissions also needs to work now.
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/permissions': { status: 200, body: PERMS_RESPONSE },
    }));

    // Ultimately lands on authenticated (not anonymous from the spurious event).
    await waitFor(() =>
      expect(screen.getByTestId('status').textContent).toBe('authenticated'),
    );
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

// Regression test for issue #246: AuthProvider must build its endpoint URLs
// through the shared `authUrl()` helper, not hardcoded `/api/auth/...`
// literals — otherwise the single-source-of-truth path scheme silently
// drifts again. Mocking the module (rather than spying on the real export)
// avoids relying on ESM named exports being writable. This fails if
// AuthProvider reverts to inline string literals, since the mocked
// authUrl() would never be invoked and the fetch calls below would 404.
vi.mock('../api-base.js', () => ({
  authUrl: vi.fn((path: string) => `/api${path}`),
}));

describe('AuthProvider uses authUrl() (issue #246 regression)', () => {
  it('resolves me/permissions through authUrl(), not a hardcoded literal', async () => {
    const { authUrl } = await import('../api-base.js');

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

    expect(authUrl).toHaveBeenCalledWith('/auth/me');
    expect(authUrl).toHaveBeenCalledWith('/auth/permissions');
  });
});
