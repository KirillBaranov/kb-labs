/**
 * @module cli-core/gateway/session
 *
 * Manages human-user session credentials stored in ~/.kb/session.json.
 * Separate from CredentialsManager (~/.kb/credentials.json, machine identity)
 * — see the module doc on SessionCredentials in ./types.js for why.
 * File permissions: 0o600 (owner read/write only).
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionCredentials, ISessionManager } from './types.js';

/** Default session file path */
const SESSION_PATH = path.join(os.homedir(), '.kb', 'session.json');

/** Buffer before expiry to trigger refresh (60 seconds) */
const EXPIRY_BUFFER_MS = 60_000;

export class SessionManager implements ISessionManager {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? SESSION_PATH;
  }

  async load(): Promise<SessionCredentials | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as SessionCredentials;
    } catch {
      return null;
    }
  }

  async save(session: SessionCredentials): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(session, null, 2), 'utf-8');
    // chmod 600 — owner read/write only
    await fs.chmod(this.filePath, 0o600);
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // file doesn't exist — ok
    }
  }

  isExpired(session: SessionCredentials): boolean {
    return Date.now() >= session.expiresAt - EXPIRY_BUFFER_MS;
  }

  async refresh(session: SessionCredentials): Promise<SessionCredentials> {
    const url = `${session.gatewayUrl}/auth/refresh/cli`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Session refresh failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };

    const updated: SessionCredentials = {
      gatewayUrl: session.gatewayUrl,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
      email: session.email,
      tenantId: session.tenantId,
    };

    await this.save(updated);
    return updated;
  }
}
