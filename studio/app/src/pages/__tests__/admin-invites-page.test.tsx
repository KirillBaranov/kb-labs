/**
 * @vitest-environment jsdom
 *
 * Tests for AdminInvitesPage (ADR-0020, Phase 2.8).
 *
 * Coverage:
 *   - Requires INVITES_READ permission (shows 403 without it)
 *   - Loads invite list from GET /api/auth/invites
 *   - Renders invite email
 *   - Create invite form: POST /api/auth/invites → copies activation URL to clipboard
 *   - Revoke button: POST /api/auth/invites/:id/revoke
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../auth/guards.js';
import type { AuthState } from '../../auth/auth-provider.js';
import { AdminInvitesPage } from '../admin-invites-page.js';

const INVITES = [
  { inviteId: 'inv-1', email: 'newuser@test.com', status: 'pending', expiresAt: new Date(Date.now() + 86400000).toISOString() },
];

function makeAuth(permissions: string[] = ['invites:read', 'invites:write']): AuthState {
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
        <AdminInvitesPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('AdminInvitesPage', () => {
  it('shows 403 page when user lacks invites:read permission', () => {
    renderPage(makeAuth([]));
    expect(screen.getByTestId('forbidden-page')).toBeDefined();
  });

  it('renders invite list', async () => {
    vi.stubGlobal('fetch', mockFetch({ '/api/auth/invites': { status: 200, body: INVITES } }));
    renderPage();

    await waitFor(() => expect(screen.getByText(/newuser@test\.com/i)).toBeDefined());
  });

  it('sends POST /api/auth/invites and shows clipboard toast on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const mockF = mockFetch({
      '/api/auth/invites': { status: 200, body: INVITES },
      // POST to /api/auth/invites returns activation URL
    });
    // Override to handle POST separately
    const realMockF = vi.fn((url: string, init?: RequestInit) => {
      if (String(url).includes('/api/auth/invites') && (init as RequestInit | undefined)?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ activationUrl: 'https://kb-cloud.kblabs.ru/activate/tok-xyz' }),
        });
      }
      return mockF(url);
    }) as unknown as typeof fetch;

    vi.stubGlobal('fetch', realMockF);
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/invite email/i)).toBeDefined());

    fireEvent.change(screen.getByLabelText(/invite email/i), {
      target: { value: 'newbie@test.com' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /create invite form/i }));
    });

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0]?.[0]).toContain('activate/tok-xyz');

    // Toast / success message
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeDefined());
  });

  it('calls POST /api/auth/invites/:id/revoke on revoke click', async () => {
    const mockF = mockFetch({
      '/api/auth/invites': { status: 200, body: INVITES },
      '/api/auth/invites/inv-1/revoke': { status: 200, body: { ok: true } },
    });
    vi.stubGlobal('fetch', mockF);
    renderPage();

    await waitFor(() => expect(screen.getByText(/newuser@test\.com/i)).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    });

    const revokeCalls = (mockF.mock.calls as Array<[unknown]>).filter(([u]) =>
      String(u).includes('/revoke'),
    );
    expect(revokeCalls).toHaveLength(1);
  });
});
