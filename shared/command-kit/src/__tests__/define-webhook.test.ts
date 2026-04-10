/**
 * @file Unit tests for defineWebhook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineWebhook, isWebhookHost } from '../define-webhook.js';
import type { PluginContextV3, WebhookHostContext } from '@kb-labs/plugin-contracts';

describe('defineWebhook', () => {
  let mockContext: PluginContextV3<unknown>;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    const webhookHostContext: WebhookHostContext = {
      host: 'webhook',
      event: 'github:push',
      source: 'github',
      payload: { ref: 'refs/heads/main' },
    };

    mockContext = {
      host: 'webhook',
      hostContext: webhookHostContext,
      ui: {} as any,
      platform: {} as any,
      config: {},
    } as any;
  });

  describe('host validation', () => {
    it('should throw error if host is not webhook', async () => {
      const handler = defineWebhook({
        event: 'github:push',
        handler: {
          async execute() {
            return { data: {}, exitCode: 0 };
          },
        },
      });

      const invalidContext = {
        ...mockContext,
        host: 'cli' as const,
        hostContext: { host: 'cli' as const } as any,
      };

      await expect(
        handler.execute(invalidContext, {})
      ).rejects.toThrow('can only run in webhook host');
    });

    it('should throw error if event name mismatch', async () => {
      const handler = defineWebhook({
        event: 'github:push',
        handler: {
          async execute() {
            return { data: {}, exitCode: 0 };
          },
        },
      });

      const wrongEventContext = {
        ...mockContext,
        hostContext: {
          ...mockContext.hostContext,
          event: 'github:pull_request',
        } as WebhookHostContext,
      };

      await expect(
        handler.execute(wrongEventContext, {})
      ).rejects.toThrow('expects event github:push but got github:pull_request');
    });

    it('should accept valid webhook host context', async () => {
      const execute = vi.fn(async () => ({ data: {}, exitCode: 0 }));

      const handler = defineWebhook({
        event: 'github:push',
        handler: { execute },
      });

      await handler.execute(mockContext, {});

      expect(execute).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should call cleanup after successful execution', async () => {
      const cleanup = vi.fn();

      const handler = defineWebhook({
        event: 'github:push',
        handler: {
          async execute() {
            return { data: {}, exitCode: 0 };
          },
          cleanup,
        },
      });

      await handler.execute(mockContext, {});

      expect(cleanup).toHaveBeenCalled();
    });

    it('should call cleanup even if handler throws', async () => {
      const cleanup = vi.fn();

      const handler = defineWebhook({
        event: 'github:push',
        handler: {
          async execute() {
            throw new Error('Handler error');
          },
          cleanup,
        },
      });

      await expect(handler.execute(mockContext, {})).rejects.toThrow('Handler error');

      expect(cleanup).toHaveBeenCalled();
    });
  });
});

describe('isWebhookHost', () => {
  it('should return true for webhook host context', () => {
    const webhookContext: WebhookHostContext = {
      host: 'webhook',
      event: 'github:push',
      source: 'github',
      payload: {},
    };

    expect(isWebhookHost(webhookContext)).toBe(true);
  });

  it('should return false for non-webhook host context', () => {
    const cliContext = {
      host: 'cli' as const,
      argv: [],
      flags: {},
    };

    expect(isWebhookHost(cliContext)).toBe(false);
  });
});
