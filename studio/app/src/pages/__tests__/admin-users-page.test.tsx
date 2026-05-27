/**
 * @vitest-environment jsdom
 *
 * Tests for AdminUsersPage (ADR-0020, Phase 2.8).
 *
 * Coverage:
 *   - Requires USERS_READ permission (shows 403 without it)
 *   - Loads user list from GET /api/auth/users
 *   - Renders user email + status
 *   - Disable button calls POST /api/auth/users/:id/disable (requires USERS_WRITE)
 *   - Enable button calls POST /api/auth/users/:id/enable
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../auth/guards.js';
import type { AuthState } from '../../auth/auth-provider.js';
import { AdminUsersPage } from '../admin-users-page.js';

const USERS = [
  { userId: 'u1', email: 'alice@test.com', tenantId: 'kb-cloud', status: 'active' },
  { userId: 'u2', email: 'bob@test.com', tenantId: 'kb-cloud', status: 'disabled' },
];

function makeAuth(permissions: string[] = ['users:read', 'users:write']): AuthState {
  return {
    status: 'authenticated',
    user: { userId: 'admin', email: 'admin@test.com', tenantId: 'kb-cloud' },
    permissions: new Set(permissions),
    login: vi.fn(),
    logout: vi.fn(),
  } as AuthState;
}

function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn((url: string) => {
    const match = Object.entries(responses).find(([k]) => String(url).includes(k));
    if (!match) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    const [, { status, body }] = match;
    return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  }) as unknown as typeof fetch;
}

function renderPage(auth = makeAuth()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <AdminUsersPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('AdminUsersPage', () => {
  it('shows 403 page when user lacks users:read permission', () => {
    renderPage(makeAuth([]));
    expect(screen.getByTestId('forbidden-page')).toBeDefined();
  });

  it('renders user list with email and status', async () => {
    vi.stubGlobal('fetch', mockFetch({ '/api/auth/users': { status: 200, body: USERS } }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/alice@test\.com/i)).toBeDefined());
    expect(screen.getByText(/alice@test\.com/i)).toBeDefined();
    expect(screen.getByText(/bob@test\.com/i)).toBeDefined();
  });

  it('calls POST /api/auth/users/:id/disable for active user', async () => {
    const mockF = mockFetch({
      '/api/auth/users': { status: 200, body: USERS },
      '/api/auth/users/u1/disable': { status: 200, body: { ok: true } },
    });
    vi.stubGlobal('fetch', mockF);
    renderPage();

    await waitFor(() => expect(screen.getByText(/alice@test\.com/i)).toBeDefined());

    const disableBtn = screen.getAllByRole('button', { name: /disable/i })[0]!;
    await act(async () => { fireEvent.click(disableBtn); });

    const disableCalls = (mockF.mock.calls as Array<[unknown]>).filter(([u]) =>
      String(u).includes('/disable'),
    );
    expect(disableCalls).toHaveLength(1);
  });

  it('calls POST /api/auth/users/:id/enable for disabled user', async () => {
    const mockF = mockFetch({
      '/api/auth/users': { status: 200, body: USERS },
      '/api/auth/users/u2/enable': { status: 200, body: { ok: true } },
    });
    vi.stubGlobal('fetch', mockF);
    renderPage();

    await waitFor(() => expect(screen.getByText(/bob@test\.com/i)).toBeDefined());

    const enableBtn = screen.getAllByRole('button', { name: /enable/i })[0]!;
    await act(async () => { fireEvent.click(enableBtn); });

    const enableCalls = (mockF.mock.calls as Array<[unknown]>).filter(([u]) =>
      String(u).includes('/enable'),
    );
    expect(enableCalls).toHaveLength(1);
  });
});
