/**
 * @module cli-core/__tests__/session
 *
 * Unit tests for SessionManager (~/.kb/session.json — human-user identity,
 * separate from CredentialsManager's machine-identity store).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SessionManager } from '../gateway/session.js';
import type { SessionCredentials } from '../gateway/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

const SESSION: SessionCredentials = {
  gatewayUrl: 'http://localhost:4000',
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  expiresAt: Date.now() + 60_000,
  email: 'admin@bootstrap.local',
  tenantId: 'default',
};

let tmpDir: string;
let filePath: string;
let manager: SessionManager;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-session-test-'));
  filePath = path.join(tmpDir, 'session.json');
  manager = new SessionManager(filePath);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('SessionManager', () => {
  it('SM-01: load() returns null when no file exists', async () => {
    expect(await manager.load()).toBeNull();
  });

  it('SM-02: save() then load() round-trips the session', async () => {
    await manager.save(SESSION);
    expect(await manager.load()).toEqual(SESSION);
  });

  it('SM-03: save() sets file permissions to 0o600', async () => {
    await manager.save(SESSION);
    const stat = await fs.stat(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('SM-04: clear() removes the file; is a no-op when absent', async () => {
    await manager.save(SESSION);
    await manager.clear();
    expect(await manager.load()).toBeNull();
    await expect(manager.clear()).resolves.not.toThrow();
  });

  it('SM-05: isExpired() true when past expiresAt (with buffer)', () => {
    expect(manager.isExpired({ ...SESSION, expiresAt: Date.now() - 1 })).toBe(true);
    expect(manager.isExpired({ ...SESSION, expiresAt: Date.now() + 120_000 })).toBe(false);
  });

  it('SM-06: refresh() hits /auth/refresh/cli, not /auth/refresh, and persists the result', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900 }),
    );

    const updated = await manager.refresh(SESSION);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/auth/refresh/cli',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ refreshToken: SESSION.refreshToken }),
      }),
    );
    expect(updated.accessToken).toBe('new-access');
    expect(await manager.load()).toEqual(updated);
  });

  it('SM-07: refresh() throws on a non-ok response and does not persist', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ error: 'Unauthorized' }, 401));

    await expect(manager.refresh(SESSION)).rejects.toThrow(/401/);
    expect(await manager.load()).toBeNull();
  });
});
