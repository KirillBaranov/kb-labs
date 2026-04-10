import { describe, expect, it, vi } from 'vitest';

import {
  createTestContext,
  defineCommand,
  defineCommandFlags,
  defineRoute,
  defineWebhook,
  generateExamples,
} from '../index.js';

describe('SDK Deep Behavior', () => {
  it('defineCommand rejects unsupported host at runtime', async () => {
    const command = defineCommand({
      id: 'sdk:test',
      handler: {
        execute: async () => ({ exitCode: 0 }),
      },
    });

    const ctx = createTestContext({ host: 'rest' });
    expect(() => command.execute(ctx, {})).toThrow('can only run in CLI or workflow host');
  });

  it('defineRoute executes cleanup even when handler throws', async () => {
    const cleanup = vi.fn();
    const route = defineRoute({
      path: '/v1/test',
      method: 'POST',
      handler: {
        execute: async () => {
          throw new Error('boom');
        },
        cleanup,
      },
    });

    const ctx = createTestContext({
      host: 'rest',
      hostContext: {
        host: 'rest',
        method: 'POST',
        path: '/v1/test',
        requestId: 'req-1',
        traceId: 'trace-1',
      },
    });

    await expect(route.execute(ctx, { x: 1 })).rejects.toThrow('boom');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('defineWebhook validates webhook event mismatch', async () => {
    const webhook = defineWebhook({
      event: 'github:push',
      handler: {
        execute: async () => ({ exitCode: 0 }),
      },
    });

    const ctx = createTestContext({
      host: 'webhook',
      hostContext: {
        host: 'webhook',
        event: 'github:pull_request',
      },
    });

    await expect(webhook.execute(ctx, {})).rejects.toThrow(
      'Webhook expects event github:push but got github:pull_request'
    );
  });

  it('defineCommandFlags maps schema fields to manifest flags', () => {
    const flags = defineCommandFlags({
      json: { type: 'boolean', default: false, description: 'JSON output' },
      level: { type: 'string', alias: 'l', choices: ['info', 'debug'] },
    });

    expect(flags).toEqual([
      {
        name: 'json',
        type: 'boolean',
        default: false,
        description: 'JSON output',
      },
      {
        name: 'level',
        type: 'string',
        alias: 'l',
        choices: ['info', 'debug'],
      },
    ]);
  });

  it('generateExamples omits false boolean flags and keeps descriptions', () => {
    const examples = generateExamples('release', 'kb', [
      { flags: { dryRun: true }, description: 'safe mode' },
      { flags: { dryRun: false, env: 'prod' } },
    ]);

    expect(examples).toEqual([
      'kb release --dryRun # safe mode',
      'kb release --env=prod',
    ]);
  });
});
