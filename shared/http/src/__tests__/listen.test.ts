import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getListenOptions } from '../listen.js';

const origEnv = process.env.KB_SOCKET_PATH;

afterEach(() => {
  if (origEnv === undefined) {
    delete process.env.KB_SOCKET_PATH;
  } else {
    process.env.KB_SOCKET_PATH = origEnv;
  }
});

describe('getListenOptions()', () => {
  it('returns { port, host } when KB_SOCKET_PATH is not set', () => {
    delete process.env.KB_SOCKET_PATH;
    expect(getListenOptions(5050)).toEqual({ port: 5050, host: '127.0.0.1' });
  });

  it('uses provided host when KB_SOCKET_PATH is not set', () => {
    delete process.env.KB_SOCKET_PATH;
    expect(getListenOptions(5050, '0.0.0.0')).toEqual({ port: 5050, host: '0.0.0.0' });
  });

  it('returns { path } when KB_SOCKET_PATH is set', () => {
    const sockPath = join(tmpdir(), `kb-test-listen-${Date.now()}.sock`);
    process.env.KB_SOCKET_PATH = sockPath;
    const result = getListenOptions(5050);
    expect(result).toEqual({ path: sockPath });
  });

  it('removes stale socket file before returning', () => {
    const sockPath = join(tmpdir(), `kb-test-stale-${Date.now()}.sock`);
    writeFileSync(sockPath, 'stale');
    expect(existsSync(sockPath)).toBe(true);
    process.env.KB_SOCKET_PATH = sockPath;
    getListenOptions(5050);
    expect(existsSync(sockPath)).toBe(false);
  });

  it('creates parent directory if missing', () => {
    const dir = join(tmpdir(), `kb-test-dir-${Date.now()}`);
    const sockPath = join(dir, 'test.sock');
    process.env.KB_SOCKET_PATH = sockPath;
    getListenOptions(5050);
    // Dir must exist even though socket file itself was not created
    expect(existsSync(dir)).toBe(true);
  });

  it('non-existent socket file causes no error (force: true)', () => {
    const sockPath = join(tmpdir(), `kb-test-nonexistent-${Date.now()}.sock`);
    process.env.KB_SOCKET_PATH = sockPath;
    expect(() => getListenOptions(5050)).not.toThrow();
  });
});
