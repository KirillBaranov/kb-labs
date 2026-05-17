/**
 * @module @kb-labs/adapters-telegram
 * Telegram INotifierChannel implementation.
 *
 * Rate limit: Telegram Bot API global limit ≈ 30 messages/second.
 * This adapter relies on ResourceBroker (QueuedNotifierChannel) for rate limiting and retry.
 *
 * Risks addressed:
 *   R4 — body truncated to 3800 chars to stay within Telegram's 4096-char limit
 *   R5 — title/body HTML-escaped (parse_mode: HTML)
 *   R6 — AbortSignal.timeout(10_000) prevents infinite hang
 */

import type { INotifierChannel, NotificationCapability, NotificationEvent } from '@kb-labs/sdk/adapters';

export { manifest } from './manifest.js';

export interface TelegramChannelConfig {
  botToken: string;
  /** Chat, group, or channel ID. Groups use negative IDs like "-1001234567890". */
  chatId: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MAX_BODY_CHARS = 3800;

function formatMessage(event: NotificationEvent): string {
  const title = `<b>${escapeHtml(event.title)}</b>`;
  const body = escapeHtml(
    event.body.length > MAX_BODY_CHARS
      ? event.body.slice(0, MAX_BODY_CHARS) + '\n…(truncated)'
      : event.body
  );
  const parts = [title, body];
  if (event.action) {
    parts.push(`<a href="${event.action.url}">${escapeHtml(event.action.label)}</a>`);
  }
  return parts.join('\n');
}

class TelegramChannel implements INotifierChannel {
  readonly id: string;
  readonly capabilities: NotificationCapability[] = ['realtime', 'rich', 'interactive'];
  /** Telegram Bot API global rate limit ~30 req/s. */
  readonly rateLimit = 30;

  constructor(
    private config: TelegramChannelConfig,
    id: string
  ) {
    this.id = id;
  }

  isAvailable(): boolean {
    return Boolean(this.config.botToken && this.config.chatId);
  }

  async send(event: NotificationEvent): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.config.chatId,
          text: formatMessage(event),
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // Network error or timeout — retryable
      const error = err instanceof Error ? err : new Error(String(err));
      error.message = `Telegram fetch failed: ${error.message}`;
      throw error;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(`Telegram API error ${response.status}: ${body}`);
      // 429 and 5xx are retryable; 4xx are not
      if (response.status === 429 || response.status >= 500) {
        throw error;
      }
      // Non-retryable — mark so ResourceBroker won't retry
      (error as Error & { retryable?: boolean }).retryable = false;
      throw error;
    }
  }
}

/**
 * Create a Telegram INotifierChannel.
 * Pass the config key (e.g. 'telegram-ops') as `id` so the router can match it to routing rules.
 */
export function createTelegramChannel(
  config: TelegramChannelConfig,
  id: string
): INotifierChannel {
  return new TelegramChannel(config, id);
}

/** Standard channel factory name — used by loader resolution. */
export const createChannel = createTelegramChannel;
