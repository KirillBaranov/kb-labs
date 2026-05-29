/**
 * @module webhook/auth
 *
 * Webhook delivery authentication — three strategies:
 *
 * - `secret`: static header comparison (`timingSafeEqual`)
 * - `hmac`:   HMAC-SHA256 over raw body (`timingSafeEqual`)
 * - `custom`: calls a plugin validator handler via `backend.execute`
 *
 * All strategies support a previous-secret grace window for zero-downtime
 * rotation: if the current secret doesn't match, fall back to `previous`
 * provided it hasn't expired.
 *
 * Never throws — returns `{ valid: false, reason }` on any error so the
 * caller always gets a structured result to act on.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookAuthConfig } from '@kb-labs/plugin-contracts';
import type { WebhookSecretEntry, WebhookSecretStore } from './secret-store.js';

export type WebhookAuthResult = { valid: true } | { valid: false; reason: string };

export interface WebhookAuthRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  namespaceId: string;
  pluginId: string;
  event: string;
  instanceId?: string;
}

/** Minimal interface for execution backend — only `execute` is needed here. */
interface ExecutionBackend {
  execute(input: { handlerRef: string; pluginRoot: string; input: unknown }): Promise<unknown>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Extract a single header value (case-insensitive). */
function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const lower = name.toLowerCase();
  const value = headers[lower] ?? headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Constant-time string comparison via Buffer.from to avoid timing attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isPreviousValid(entry: WebhookSecretEntry): boolean {
  return (
    entry.previous !== undefined &&
    entry.previousExpiresAt !== undefined &&
    entry.previousExpiresAt > Date.now()
  );
}

// ── Strategy implementations ──────────────────────────────────────────────────

function verifySecret(
  header: string,
  headers: Record<string, string | string[] | undefined>,
  entry: WebhookSecretEntry,
): boolean {
  const value = getHeader(headers, header);
  if (!value) {
    return false;
  }

  if (safeEqual(value, entry.current)) {
    return true;
  }

  if (isPreviousValid(entry) && safeEqual(value, entry.previous!)) {
    return true;
  }

  return false;
}

function computeHmac(body: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function verifyHmac(
  header: string,
  prefix: string | undefined,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  entry: WebhookSecretEntry,
): boolean {
  const headerValue = getHeader(headers, header);
  if (!headerValue) {
    return false;
  }

  // Strip prefix if configured
  const receivedSig = prefix && headerValue.startsWith(prefix)
    ? headerValue.slice(prefix.length)
    : headerValue;

  const expectedCurrent = computeHmac(rawBody, entry.current);
  if (safeEqual(receivedSig, expectedCurrent)) {
    return true;
  }

  if (isPreviousValid(entry)) {
    const expectedPrevious = computeHmac(rawBody, entry.previous!);
    if (safeEqual(receivedSig, expectedPrevious)) {
      return true;
    }
  }

  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function verifyWebhookAuth(
  authConfig: WebhookAuthConfig,
  req: WebhookAuthRequest,
  secretStore: WebhookSecretStore,
  backend?: ExecutionBackend,
  pluginRoot?: string,
): Promise<WebhookAuthResult> {
  const entry = await secretStore.get(req.namespaceId, req.pluginId, req.event, req.instanceId);

  if (!entry) {
    return { valid: false, reason: 'not provisioned' };
  }

  switch (authConfig.type) {
    case 'secret': {
      const valid = verifySecret(authConfig.header, req.headers, entry);
      return valid ? { valid: true } : { valid: false, reason: 'invalid secret' };
    }

    case 'hmac': {
      const valid = verifyHmac(authConfig.header, authConfig.prefix, req.rawBody, req.headers, entry);
      return valid ? { valid: true } : { valid: false, reason: 'invalid hmac signature' };
    }

    case 'custom': {
      if (!backend || !pluginRoot) {
        return { valid: false, reason: 'custom validator requires backend and pluginRoot' };
      }
      try {
        const result = await backend.execute({
          handlerRef: authConfig.validator,
          pluginRoot,
          input: {
            headers: req.headers,
            rawBody: req.rawBody.toString('base64'),
            secret: entry.current,
          },
        }) as { valid: boolean };
        return result.valid ? { valid: true } : { valid: false, reason: 'custom validator rejected' };
      } catch {
        return { valid: false, reason: 'validator error' };
      }
    }
  }
}
