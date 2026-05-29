/**
 * @module webhook/provision
 *
 * Provisions a webhook secret for a plugin+event combination.
 *
 * On first call: generates a new secret, stores it, calls onProvision handler.
 * On subsequent calls: rotates the secret (old → previous with 24h grace window).
 *
 * onProvision failures are logged but do not abort provisioning — the secret
 * is always persisted. Callers display the secret once; it cannot be recovered.
 */

import { randomBytes } from 'node:crypto';
import type { ILogger } from '@kb-labs/core-platform';
import type { WebhookSecretStore } from './secret-store.js';
import type { WebhookManifestEntry } from './router.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProvisionInput {
  namespaceId: string;
  pluginId: string;
  event: string;
  instanceId?: string;
  baseUrl: string;
}

export interface ProvisionResult {
  url: string;
  secret: string;
  rotated: boolean;
  onProvisionCalled: boolean;
}

/** Minimal execution backend — only `execute` is needed. */
export interface ProvisionBackend {
  execute(input: { handlerRef: string; pluginRoot: string; input: unknown; namespaceId?: string }): Promise<unknown>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Provision (or rotate) a webhook secret for a plugin+event.
 *
 * @throws If the pluginId/event combination is not found in `manifests`.
 */
export async function provisionWebhook(
  input: ProvisionInput,
  secretStore: WebhookSecretStore,
  backend: ProvisionBackend,
  manifests: WebhookManifestEntry[],
  logger: ILogger,
): Promise<ProvisionResult> {
  const { namespaceId, pluginId, event, instanceId, baseUrl } = input;

  // Find the declaration
  const manifestEntry = manifests.find((m) => m.pluginId === pluginId);
  const decl = manifestEntry?.manifest.webhooks?.handlers.find((h) => h.event === event);

  // manifestEntry check is for TypeScript narrowing — if decl is undefined,
  // manifestEntry is also undefined (decl depends on it via optional chaining).
  if (!manifestEntry || !decl) {
    throw new Error(`webhook '${pluginId}/${event}' not found`);
  }

  // Check whether a secret already exists (determines rotated flag)
  const existing = await secretStore.get(namespaceId, pluginId, event, instanceId);
  const rotated = existing !== null;

  // Generate a new secret: 32 random bytes as hex (64 chars)
  const newSecret = randomBytes(32).toString('hex');

  // Store via rotate (preserves previous with 24h grace) or set (first time)
  if (rotated) {
    await secretStore.rotate(namespaceId, pluginId, event, newSecret, instanceId);
  } else {
    await secretStore.set(namespaceId, pluginId, event, { current: newSecret }, instanceId);
  }

  // Build webhook URL
  const url = instanceId
    ? `${baseUrl}/webhooks/${pluginId}/${event}/${instanceId}`
    : `${baseUrl}/webhooks/${pluginId}/${event}`;

  // Call onProvision handler if declared
  let onProvisionCalled = false;
  if (decl.onProvision) {
    try {
      await backend.execute({
        handlerRef: decl.onProvision,
        pluginRoot: manifestEntry.pluginRoot,
        namespaceId,
        input: { instanceId, secret: newSecret, url },
      });
      onProvisionCalled = true;
    } catch (err) {
      logger.error(
        'onProvision handler failed',
        err instanceof Error ? err : new Error(String(err)),
        { pluginId, event, instanceId },
      );
    }
  }

  return { url, secret: newSecret, rotated, onProvisionCalled };
}
