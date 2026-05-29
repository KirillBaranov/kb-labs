/**
 * @module @kb-labs/studio-app/pages/admin-invites-page
 *
 * Admin invites management page (ADR-0020, Phase 2.8).
 * Requires INVITES_READ to view; INVITES_WRITE to create/revoke.
 *
 * The invite activation URL is returned from the server and copied to clipboard.
 * No email is sent — the admin shares the link manually.
 *
 * All mutations use the shared authClient which injects CSRF headers automatically.
 */

import * as React from 'react';
import { RequirePermission } from '@/auth/guards';
import { authClient } from '../auth/shared-client.js';

interface InviteRecord {
  inviteId: string;
  email: string;
  status: 'pending' | 'consumed' | 'revoked';
  expiresAt: string;
}

function InvitesList() {
  const [invites, setInvites] = React.useState<InviteRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [email, setEmail] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [copyMessage, setCopyMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadInvites = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await authClient.fetch<InviteRecord[]>('/auth/invites');
      setInvites(data);
    } catch {
      setError('Failed to load invites');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadInvites(); }, [loadInvites]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCopyMessage(null);
    try {
      const data = await authClient.fetch<{ activationUrl: string }>('/auth/invites', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      await navigator.clipboard.writeText(data.activationUrl);
      setCopyMessage('Activation URL copied to clipboard!');
      setEmail('');
      await loadInvites();
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string } }).body;
      setError(body?.error ?? 'Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await authClient.fetch<unknown>(`/auth/invites/${inviteId}/revoke`, { method: 'POST' });
      await loadInvites();
    } catch {
      setError('Failed to revoke invite');
    }
  };

  return (
    <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Invites</h1>

      {/* Create invite form */}
      <form
        aria-label="create invite form"
        onSubmit={(e) => { void handleCreate(e); }}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}
        noValidate
      >
        <label htmlFor="invite-email" style={{ position: 'absolute', clip: 'rect(0 0 0 0)' }}>
          Invite email
        </label>
        <input
          id="invite-email"
          type="email"
          placeholder="Email address"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Invite email"
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid var(--border-primary, #d9d9d9)',
            fontSize: '0.9rem',
          }}
        />
        <button
          type="submit"
          disabled={creating}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '6px',
            background: 'var(--color-primary, #667eea)',
            color: '#fff',
            fontWeight: 600,
            border: 'none',
            cursor: creating ? 'not-allowed' : 'pointer',
          }}
        >
          {creating ? 'Inviting…' : 'Invite'}
        </button>
      </form>

      {copyMessage && (
        <p style={{ color: 'var(--color-success, #52c41a)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          {copyMessage}
        </p>
      )}
      {error && <p role="alert" style={{ color: 'red', marginBottom: '1rem' }}>{error}</p>}

      {loading && <p>Loading invites…</p>}

      {!loading && invites.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Expires</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.inviteId}>
                <td style={tdStyle}>{invite.email}</td>
                <td style={tdStyle}>{invite.status}</td>
                <td style={tdStyle}>{new Date(invite.expiresAt).toLocaleDateString()}</td>
                <td style={tdStyle}>
                  {invite.status === 'pending' && (
                    <button
                      onClick={() => void handleRevoke(invite.inviteId)}
                      style={dangerButtonStyle}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && invites.length === 0 && (
        <p style={{ color: 'var(--text-secondary, #888)' }}>No pending invites.</p>
      )}
    </div>
  );
}

export function AdminInvitesPage() {
  return (
    <RequirePermission permission="invites:read">
      <InvitesList />
    </RequirePermission>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  borderBottom: '2px solid var(--border-primary, #e0e0e0)',
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid var(--border-primary, #e0e0e0)',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.6rem',
  borderRadius: '4px',
  border: '1px solid var(--color-error, #ff4d4f)',
  background: 'transparent',
  color: 'var(--color-error, #ff4d4f)',
  cursor: 'pointer',
  fontSize: '0.8rem',
};
