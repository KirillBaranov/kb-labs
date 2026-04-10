/**
 * @module cli-core/gateway/credentials
 *
 * Manages Gateway credentials stored in ~/.kb/credentials.json.
 * File permissions: 0o600 (owner read/write only).
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { GatewayCredentials, ICredentialsManager } from './types.js';

/** Default credentials file path */
const CREDENTIALS_PATH = path.join(os.homedir(), '.kb', 'credentials.json');

/** Buffer before expiry to trigger refresh (60 seconds) */
const EXPIRY_BUFFER_MS = 60_000;

export class CredentialsManager implements ICredentialsManager {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? CREDENTIALS_PATH;
  }

  async load(): Promise<GatewayCredentials | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as GatewayCredentials;
    } catch {
      return null;
    }
  }

  async save(credentials: GatewayCredentials): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(credentials, null, 2), 'utf-8');
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

  isExpired(credentials: GatewayCredentials): boolean {
    return Date.now() >= credentials.expiresAt - EXPIRY_BUFFER_MS;
  }

  async refresh(credentials: GatewayCredentials): Promise<GatewayCredentials> {
    const url = `${credentials.gatewayUrl}/auth/refresh`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: credentials.refreshToken }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Token refresh failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };

    const updated: GatewayCredentials = {
      gatewayUrl: credentials.gatewayUrl,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + data.expiresIn * 1000,
    };

    await this.save(updated);
    return updated;
  }
}
