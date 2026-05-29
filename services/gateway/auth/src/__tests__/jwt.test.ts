import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../jwt.js';

const config = { secret: 'test-secret-at-least-32-chars-long!!' };

describe('signAccessToken / verifyAccessToken', () => {
  it('issues a verifiable access token', async () => {
    const { token, expiresIn } = await signAccessToken(
      { hostId: 'host_abc', namespaceId: 'ns1', tier: 'free', type: 'machine' },
      config,
    );

    expect(token).toBeTruthy();
    expect(expiresIn).toBe(15 * 60);

    const payload = await verifyAccessToken(token, config);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('host_abc');
    expect(payload!.namespaceId).toBe('ns1');
    expect(payload!.tier).toBe('free');
    expect(payload!.type).toBe('machine');
  });

  it('returns null for tampered token', async () => {
    const { token } = await signAccessToken(
      { hostId: 'host_abc', namespaceId: 'ns1', tier: 'free', type: 'machine' },
      config,
    );
    const tampered = token.slice(0, -5) + 'XXXXX';
    const result = await verifyAccessToken(tampered, config);
    expect(result).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const { token } = await signAccessToken(
      { hostId: 'host_abc', namespaceId: 'ns1', tier: 'free', type: 'machine' },
      config,
    );
    const result = await verifyAccessToken(token, { secret: 'wrong-secret-at-least-32-chars!!' });
    expect(result).toBeNull();
  });
});

describe('signRefreshToken / verifyRefreshToken', () => {
  it('issues a verifiable refresh token', async () => {
    const token = await signRefreshToken('host_abc', config);
    expect(token).toBeTruthy();

    const result = await verifyRefreshToken(token, config);
    expect(result).not.toBeNull();
    expect(result!.hostId).toBe('host_abc');
  });

  it('returns null for access token passed as refresh', async () => {
    const { token } = await signAccessToken(
      { hostId: 'host_abc', namespaceId: 'ns1', tier: 'free', type: 'machine' },
      config,
    );
    // access token has type: 'machine', not 'refresh'
    const result = await verifyRefreshToken(token, config);
    expect(result).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await signRefreshToken('host_abc', config);
    const result = await verifyRefreshToken(token, { secret: 'wrong-secret-at-least-32-chars!!' });
    expect(result).toBeNull();
  });
});
