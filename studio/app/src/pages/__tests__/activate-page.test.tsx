/**
 * @vitest-environment jsdom
 *
 * Tests for ActivatePage (ADR-0020, Phase 2.5).
 *
 * Coverage:
 *   - Renders password + confirm fields
 *   - meta referrer="no-referrer" present in document
 *   - On submit: calls POST /api/auth/activate with token + password
 *   - Success: history.replaceState called to strip token from URL, navigate /
 *   - Invalid/expired token → "invalid or expired" message
 *   - Password mismatch → client-side validation error (no server call)
 *   - Policy violation from server → shows error reason
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthContext } from '../../auth/guards.js';
import type { AuthState } from '../../auth/auth-provider.js';
import { ActivatePage } from '../activate-page.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnonAuth(): AuthState {
  return {
    status: 'anonymous',
    permissions: new Set(),
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  } as AuthState;
}

function renderActivate(token = 'tok-abc123', auth = makeAnonAuth()) {
  return render(
    <MemoryRouter initialEntries={[`/activate/${token}`]}>
      <AuthContext.Provider value={auth}>
        <Routes>
          <Route path="/activate/:token" element={<ActivatePage />} />
          <Route path="/" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function mockActivateFetch(result: 'ok' | 'expired' | 'weak_password') {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/activate')) {
      if (result === 'ok') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ userId: 'u1' }),
        });
      }
      if (result === 'expired') {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'invalid_invite' }),
        });
      }
      // weak_password
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'password_too_weak' }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ActivatePage', () => {
  beforeEach(() => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  it('renders password and confirm password fields', () => {
    renderActivate();
    expect(screen.getByLabelText(/^password$/i)).toBeDefined();
    expect(screen.getByLabelText(/confirm password/i)).toBeDefined();
  });

  it('has meta referrer=no-referrer in document head', () => {
    renderActivate();
    // The component sets the referrer policy via a <meta> tag rendered in the page
    const meta = document.querySelector('meta[name="referrer"]');
    expect(meta).not.toBeNull();
    expect(meta?.getAttribute('content')).toBe('no-referrer');
  });

  it('shows validation error when passwords do not match', async () => {
    renderActivate();

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'Secret123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'Different!' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /activate form/i }));
    });

    expect(screen.getByText(/passwords do not match/i)).toBeDefined();
  });

  it('calls POST /api/auth/activate with token and password on submit', async () => {
    const mockFetch = mockActivateFetch('ok');
    vi.stubGlobal('fetch', mockFetch);

    renderActivate('my-token-xyz');

    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'NewSecret123!' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'NewSecret123!' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /activate form/i }));
    });

    const call = mockFetch.mock.calls[0];
    expect(String(call?.[0])).toContain('/api/auth/activate');
    const body = JSON.parse((call?.[1] as RequestInit)?.body as string);
    expect(body.token).toBe('my-token-xyz');
    expect(body.password).toBe('NewSecret123!');
  });

  it('calls history.replaceState after successful activation', async () => {
    vi.stubGlobal('fetch', mockActivateFetch('ok'));
    renderActivate('tok-123');

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'Pass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Pass123!' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /activate form/i }));
    });

    await waitFor(() =>
      expect(window.history.replaceState).toHaveBeenCalled(),
    );
  });

  it('navigates to / after successful activation', async () => {
    vi.stubGlobal('fetch', mockActivateFetch('ok'));
    renderActivate('tok-123');

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'Pass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Pass123!' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /activate form/i }));
    });

    await waitFor(() => expect(screen.getByTestId('home-page')).toBeDefined());
  });

  it('shows "invalid or expired" message when server returns invalid_invite', async () => {
    vi.stubGlobal('fetch', mockActivateFetch('expired'));
    renderActivate();

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'Pass123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Pass123!' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /activate form/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/invalid or expired/i)).toBeDefined(),
    );
  });

  it('shows server error reason for password policy violations', async () => {
    vi.stubGlobal('fetch', mockActivateFetch('weak_password'));
    renderActivate();

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'weak' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'weak' } });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /activate form/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/password_too_weak/i)).toBeDefined(),
    );
  });
});
