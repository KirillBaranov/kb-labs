/**
 * Manifest for the webhook-echo E2E fixture plugin.
 *
 * Declares five webhook handlers for testing all webhook auth types and features:
 *   - echo:         secret auth, sync
 *   - echo-hmac:    HMAC-SHA256, sync
 *   - echo-async:   secret auth, async (202 immediate)
 *   - echo-slack:   secret + challenge (Slack url_verification), sync
 *   - echo-multi:   secret auth, multi: true (per-instance secrets)
 *
 * The plugin must be installed in marketplace.lock before running full delivery
 * E2E tests. Admin-route tests (provision / list / revoke) work without it.
 *
 * Install:
 *   pnpm kb marketplace install ./e2e/gateway/fixtures/webhook-echo-plugin
 */

import type { ManifestV3 } from '@kb-labs/plugin-contracts';

export const manifest: ManifestV3 = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/e2e-webhook-echo',
  version: '1.0.0',
  display: {
    name: 'Webhook Echo (E2E Fixture)',
    description: 'Fixture plugin for gateway webhook E2E tests — echoes payloads back.',
  },
  webhooks: {
    handlers: [
      {
        event: 'echo',
        handler: './handlers/echo.js#default',
        auth: { type: 'secret', header: 'X-Echo-Secret' },
        // delivery_id is used by WH-06 idempotency E2E test
        idempotencyKey: 'delivery_id',
      },
      {
        event: 'echo-hmac',
        handler: './handlers/echo-hmac.js#default',
        auth: {
          type: 'hmac',
          header: 'X-Hub-Signature-256',
          algorithm: 'sha256',
          prefix: 'sha256=',
        },
      },
      {
        event: 'echo-async',
        handler: './handlers/echo-async.js#default',
        auth: { type: 'secret', header: 'X-Echo-Secret' },
        async: true,
      },
      {
        event: 'echo-slack',
        handler: './handlers/echo-slack.js#default',
        auth: { type: 'secret', header: 'X-Slack-Signature' },
        challenge: {
          bodyPath: 'type',
          value: 'url_verification',
          replyPath: 'challenge',
        },
      },
      {
        event: 'echo-multi',
        handler: './handlers/echo-multi.js#default',
        auth: { type: 'secret', header: 'X-Echo-Secret' },
        multi: true,
      },
    ],
  },
};
