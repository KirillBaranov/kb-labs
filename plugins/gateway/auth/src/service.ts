/**
 * AuthService — orchestrates registration, token issuance, and refresh.
 * Depends on ICache (via store) and JWT config.
 */

import type { ICache } from '@kb-labs/core-platform';
import type {
  RegisterRequest,
  RegisterResponse,
  TokenResponse,
  AuthContext,
} from '@kb-labs/gateway-contracts';
import {
  buildClientRecord,
  generateClientSecret,
  saveClient,
  verifyClientSecret,
  saveRefreshToken,
  consumeRefreshToken,
  savePublicKey,
} from './store.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type JwtConfig,
} from './jwt.js';

export class AuthService {
  constructor(
    private readonly cache: ICache,
    private readonly jwtConfig: JwtConfig,
  ) {}

  // ── Register ──────────────────────────────────────────────────────────────

  async register(req: RegisterRequest): Promise<RegisterResponse & { clientSecret: string }> {
    const secret = generateClientSecret();
    const record = buildClientRecord({
      name: req.name,
      namespaceId: req.namespaceId,
      capabilities: req.capabilities ?? [],
      publicKey: req.publicKey,
      secret,
    });

    await saveClient(this.cache, record);

    if (req.publicKey) {
      await savePublicKey(this.cache, record.hostId, req.publicKey);
    }

    return {
      clientId: record.clientId,
      clientSecret: secret,   // returned ONCE, never stored in plaintext
      hostId: record.hostId,
    };
  }

  // ── Issue token pair ──────────────────────────────────────────────────────

  async issueTokens(clientId: string, clientSecret: string): Promise<TokenResponse | null> {
    const record = await verifyClientSecret(this.cache, clientId, clientSecret);
    if (!record) {return null;}

    const [{ token: accessToken, expiresIn }, refreshToken] = await Promise.all([
      signAccessToken(
        {
          hostId: record.hostId,
          namespaceId: record.namespaceId,
          tier: record.tier,
          type: 'machine',
        },
        this.jwtConfig,
      ),
      signRefreshToken(record.hostId, this.jwtConfig),
    ]);

    await saveRefreshToken(this.cache, refreshToken, record.hostId, record.namespaceId);

    return { accessToken, refreshToken, expiresIn, tokenType: 'Bearer' };
  }

  // ── Refresh token pair ────────────────────────────────────────────────────

  async refreshTokens(refreshToken: string): Promise<TokenResponse | null> {
    // Verify JWT signature first
    const jwtResult = await verifyRefreshToken(refreshToken, this.jwtConfig);
    if (!jwtResult) {return null;}

    // Consume from store (rotation — old token invalidated)
    const stored = await consumeRefreshToken(this.cache, refreshToken);
    if (!stored) {return null;}

    // Reload client record to get current tier/namespace
    // We need to scan by hostId — store clientId → hostId mapping for lookup
    // For now: resolve via a secondary key written at registration
    const hostId = stored.hostId;

    // Issue new pair
    const [{ token: accessToken, expiresIn }, newRefreshToken] = await Promise.all([
      signAccessToken(
        { hostId, namespaceId: stored.namespaceId, tier: 'free', type: 'machine' },
        this.jwtConfig,
      ),
      signRefreshToken(hostId, this.jwtConfig),
    ]);

    await saveRefreshToken(this.cache, newRefreshToken, hostId, stored.namespaceId);

    return { accessToken, refreshToken: newRefreshToken, expiresIn, tokenType: 'Bearer' };
  }

  // ── Verify access token → AuthContext ────────────────────────────────────

  async verify(token: string): Promise<AuthContext | null> {
    const payload = await verifyAccessToken(token, this.jwtConfig);
    if (!payload) {return null;}

    return {
      type: payload.type,
      userId: payload.sub,
      namespaceId: payload.namespaceId,
      tier: payload.tier,
      permissions: ['host:connect'],
    };
  }
}
