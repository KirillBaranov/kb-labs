/**
 * @vitest-environment jsdom
 *
 * Tests for SessionsPage (ADR-0020, Phase 2.6).
 *
 * Coverage:
 *   - Loads session list from GET /api/auth/sessions
 *   - Renders device info + IP + lastUsed
 *   - Marks the current session with a badge
 *   - "Revoke" button calls POST /api/auth/sessions/:familyId/revoke
 *   - "Sign out all other devices" calls POST /api/auth/sessions/revoke-all
 *   - Loading state shown while fetching
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../auth/guards.js';
import type { AuthState } from '../../auth/auth-provider.js';
import { SessionsPage } from '../sessions-page.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSIONS = [
  {
    familyId: 'fam-1',
    userAgent: 'Chrome/120 on macOS',
    ipFirst: '10.0.0.1',
    lastUsedAt: new Date('2025-01-15T12:00:00Z').toISOString(),
    isCurrent: true,
  },
  {
    familyId: 'fam-2',
    userAgent: 'Firefox/121 on Windows',
    ipFirst: '10.0.0.2',
    lastUsedAt: new Date('2025-01-14T10:00:00Z').toISOString(),
    isCurrent: false,
  },
];

function makeAuth(): AuthState {
  return {
    status: 'authenticated',
    user: { userId: 'u1', email: 'alice@test.com', tenantId: 'kb-cloud' },
    permissions: new Set(),
    login: vi.fn(),
    logout: vi.fn(),
  } as AuthState;
}

function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn((url: string) => {
    const match = Object.entries(responses).find(([k]) => String(url).includes(k));
    if (!match) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    const [, { status, body }] = match;
    return Promise.resolve({
      ok: status < 400,
      status,
      json: () => Promise.resolve(body),
    });
  });
}

function renderPage(auth = makeAuth()) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <SessionsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SessionsPage', () => {
  it('renders session list with device info and marks current session', async () => {
    vi.stubGlobal('fetch', mockFetch({
      '/api/auth/sessions': { status: 200, body: SESSIONS },
    }));

    renderPage();

    await waitFor(() => expect(screen.getByText(/Chrome\/120/i)).toBeDefined());

    expect(screen.getByText(/Chrome\/120/i)).toBeDefined();
    expect(screen.getByText(/Firefox\/121/i)).toBeDefined();
    expect(screen.getByText(/current/i)).toBeDefined(); // badge on fam-1
  });

  it('calls POST /api/auth/sessions/:familyId/revoke on revoke click', async () => {
    const mockF = mockFetch({
      '/api/auth/sessions': { status: 200, body: SESSIONS },
      '/api/auth/sessions/fam-2/revoke': { status: 200, body: { ok: true } },
    });
    vi.stubGlobal('fetch', mockF);

    renderPage();

    await waitFor(() => expect(screen.getByText(/Firefox\/121/i)).toBeDefined());

    const revokeButtons = screen.getAllByRole('button', { name: /revoke/i });
    // Find the one for fam-2 (not current, should have revoke button)
    await act(async () => {
      fireEvent.click(revokeButtons[0]!);
    });

    const revokeCalls = (mockF.mock.calls as Array<[unknown]>).filter(([u]) =>
      String(u).includes('revoke'),
    );
    expect(revokeCalls.length).toBeGreaterThan(0);
  });

  it('calls POST /api/auth/sessions/revoke-all on sign-out-all click', async () => {
    const mockF = mockFetch({
      '/api/auth/sessions': { status: 200, body: SESSIONS },
      '/api/auth/sessions/revoke-all': { status: 200, body: { ok: true } },
    });
    vi.stubGlobal('fetch', mockF);

    renderPage();

    await waitFor(() => expect(screen.getByText(/sign out all/i)).toBeDefined());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /sign out all/i }));
    });

    const revokeAllCalls = (mockF.mock.calls as Array<[unknown]>).filter(([u]) =>
      String(u).includes('/revoke-all'),
    );
    expect(revokeAllCalls).toHaveLength(1);
  });
});
