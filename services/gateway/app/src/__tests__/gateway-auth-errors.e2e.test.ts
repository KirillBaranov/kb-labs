/**
 * Gateway auth error paths — covers the "unauthorized request gets 401" contract
 * for every protected surface in one place.
 *
 * Self-bootstraps gateway via @kb-labs/shared-testing-e2e.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  KbDevController,
  httpClient,
  type HttpClient,
} from '@kb-labs/shared-testing-e2e';

const controller = new KbDevController();
let client: HttpClient;

beforeAll(async () => {
  await controller.ensureServices(['gateway']);
  client = httpClient(controller.getServiceUrl('gateway'));
}, 120_000);

afterAll(async () => {
  await controller.dispose();
}, 60_000);

describe('Gateway auth errors', () => {
  describe('missing Authorization header', () => {
    it('GET /hosts → 401', async () => {
      const res = await client.get('/hosts');
      expect(res.status).toBe(401);
    });

    it('POST /api/v1/execute → 401', async () => {
      const res = await client.post('/api/v1/execute', {
        pluginId: 'p',
        handlerRef: 'h',
        input: null,
      });
      expect(res.status).toBe(401);
    });
  });

  describe('malformed Authorization header', () => {
    it('plain token without "Bearer " prefix → 401', async () => {
      const res = await client.get('/hosts', {
        headers: { Authorization: 'just-a-token' },
      });
      expect(res.status).toBe(401);
    });

    it('empty Bearer value → 401', async () => {
      const res = await client.get('/hosts', {
        headers: { Authorization: 'Bearer ' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('invalid JWT', () => {
    it('GET /hosts with garbage JWT → 401', async () => {
      const res = await client.get('/hosts', {
        headers: { Authorization: 'Bearer not.a.jwt' },
      });
      expect(res.status).toBe(401);
    });

    it('GET /hosts with wrong-signature JWT → 401', async () => {
      // A syntactically valid JWT signed with a wrong secret.
      const fakeJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiJmYWtlIiwiaWF0IjoxNzAwMDAwMDAwfQ.' +
        'bad_signature_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      const res = await client.get('/hosts', {
        headers: { Authorization: `Bearer ${fakeJwt}` },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('invalid client credentials', () => {
    it('POST /auth/token with unknown clientId → 401', async () => {
      const res = await client.post('/auth/token', {
        clientId: 'nonexistent-client',
        clientSecret: 'nonexistent-secret',
      });
      expect(res.status).toBe(401);
    });

    it('POST /auth/token with wrong secret for real clientId → 401', async () => {
      // First register a real client…
      const regRes = await client.post<{ clientId: string; clientSecret: string }>(
        '/auth/register',
        { name: 'wrong-secret-test', namespaceId: 'ns-auth-errors' },
      );
      expect(regRes.status).toBe(201);
      const clientId = regRes.body!.clientId;

      // …then try to get a token with a wrong secret.
      const res = await client.post('/auth/token', {
        clientId,
        clientSecret: 'definitely-wrong',
      });
      expect(res.status).toBe(401);
    });
  });

  describe('invalid refresh token', () => {
    it('POST /auth/refresh with garbage refreshToken → 401', async () => {
      const res = await client.post('/auth/refresh', { refreshToken: 'garbage' });
      expect(res.status).toBe(401);
    });
  });
});
