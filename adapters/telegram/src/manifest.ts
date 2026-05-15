/**
 * @module @kb-labs/adapters-telegram/manifest
 */

import type { AdapterManifest } from '@kb-labs/core-platform';

export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'telegram-notifier',
  name: 'Telegram Notifier',
  version: '0.1.0',
  description: 'Sends platform notifications to a Telegram chat via Bot API',
  author: 'KB Labs Team',
  license: 'KBPL-1.1',
  type: 'extension',
  implements: 'INotifierChannel',
  capabilities: {
    streaming: false,
  },
  configSchema: {
    botToken: {
      type: 'string',
      description: 'Telegram Bot API token (from @BotFather)',
    },
    chatId: {
      type: 'string',
      description: 'Target chat/group/channel ID. Group IDs are negative, e.g. "-1001234567890"',
    },
  },
};
