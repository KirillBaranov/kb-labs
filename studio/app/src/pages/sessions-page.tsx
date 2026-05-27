/**
 * @module @kb-labs/studio-app/pages/sessions-page
 *
 * Active sessions management page (ADR-0020, Phase 2.6).
 *
 * Shows the user's active sessions with device info, IP, and last-used time.
 * Allows revoking individual sessions or all other sessions at once.
 *
 * All mutations use the shared authClient which injects CSRF headers automatically.
 */

import * as React from 'react';
import { authClient } from '../auth/shared-client.js';

interface SessionFamily {
  familyId: string;
  userAgent: string;
  ipFirst: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

export function SessionsPage() {
  const [sessions, setSessions] = React.useState<SessionFamily[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadSessions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authClient.fetch<SessionFamily[]>('/auth/sessions');
      setSessions(data);
    } catch {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleRevoke = async (familyId: string) => {
    try {
      await authClient.fetch<unknown>(`/auth/sessions/${familyId}/revoke`, { method: 'POST' });
      await loadSessions();
    } catch {
      setError('Failed to revoke session');
    }
  };

  const handleRevokeAll = async () => {
    try {
      await authClient.fetch<unknown>('/auth/sessions/revoke-all', { method: 'POST' });
      await loadSessions();
    } catch {
      setError('Failed to sign out all devices');
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>
        Active Sessions
      </h1>
      <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '1.5rem' }}>
        Manage your active sessions across devices.
      </p>

      {loading && <p>Loading sessions…</p>}
      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

      {!loading && sessions.length > 0 && (
        <>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {sessions.map((session) => (
              <li
                key={session.familyId}
                style={{
                  border: '1px solid var(--border-primary, #e0e0e0)',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {session.userAgent}
                    {session.isCurrent && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.75rem',
                          background: '#e6f4ff',
                          color: '#1677ff',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '999px',
                          fontWeight: 600,
                        }}
                      >
                        Current
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #888)', marginTop: '0.25rem' }}>
                    {session.ipFirst} · Last used {new Date(session.lastUsedAt).toLocaleString()}
                  </div>
                </div>

                {!session.isCurrent && (
                  <button
                    onClick={() => void handleRevoke(session.familyId)}
                    style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid var(--color-error, #ff4d4f)',
                      background: 'transparent',
                      color: 'var(--color-error, #ff4d4f)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>

          <button
            onClick={() => void handleRevokeAll()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid var(--color-error, #ff4d4f)',
              background: 'transparent',
              color: 'var(--color-error, #ff4d4f)',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Sign out all other devices
          </button>
        </>
      )}
    </div>
  );
}
