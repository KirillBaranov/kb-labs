/**
 * Canonical mapping between wire-level adapter identifiers and platform slots.
 *
 * Every IPC server must resolve an adapter through this map. Keeping the
 * mapping in one place prevents one transport from silently exposing a
 * smaller adapter surface than another (for example, process IPC previously
 * omitted the document and KV database endpoints).
 */

import type { IPlatformAdapters } from '@kb-labs/core-platform';
import type { AdapterType } from '@kb-labs/core-platform/serializable';
import { platformAdapterTransportPolicy } from './adapter-contract.js';

function createIPCAdapterRoutes(): Partial<Record<AdapterType, keyof IPlatformAdapters>> {
  const routes: Partial<Record<AdapterType, keyof IPlatformAdapters>> = {};

  for (const slot of Object.keys(platformAdapterTransportPolicy) as Array<keyof IPlatformAdapters>) {
    const policy = platformAdapterTransportPolicy[slot];
    if (!('adapter' in policy)) { continue; }

    if (routes[policy.adapter] !== undefined) {
      throw new Error(`Duplicate IPC adapter route '${policy.adapter}'`);
    }
    routes[policy.adapter] = slot;
  }

  return Object.freeze(routes);
}

export const IPC_ADAPTER_ROUTES = createIPCAdapterRoutes();

/** Resolve a wire adapter identifier to its configured platform adapter. */
export function resolveIPCAdapter(
  platform: IPlatformAdapters,
  adapterType: AdapterType,
): unknown {
  const slot = IPC_ADAPTER_ROUTES[adapterType];
  if (!slot) {
    throw new Error(`Adapter '${adapterType}' is not exposed over IPC`);
  }
  const adapter = platform[slot];

  if (adapter === undefined) {
    throw new Error(`Adapter '${adapterType}' is not configured for IPC`);
  }

  return adapter;
}
