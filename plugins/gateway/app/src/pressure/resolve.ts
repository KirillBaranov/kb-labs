/**
 * @module pressure/resolve
 * Pure resource-id resolution for HTTP pressure control.
 *
 * Resolves an incoming request to one of three resource ids:
 *   - `gateway:route:<slug>`   — per-route override (highest priority)
 *   - `gateway:service:<name>` — per-upstream fallback
 *   - null                     — no pressure applies
 *
 * No broker access; no I/O. Safe to call in `onRequest` hook.
 */

import type {
  GatewayConfig,
  PressureConfig,
  PressureRouteOverride,
} from '@kb-labs/gateway-contracts';

export type ResolvedPressure =
  | { resource: string; layer: 'route'; override: PressureRouteOverride }
  | { resource: string; layer: 'service'; upstream: string }
  | null;

/**
 * Resolve a request to the resource id that should be checked against the broker.
 *
 * Order:
 *   1. perRoute overrides (first match wins by array order).
 *   2. perService — look up by upstream prefix match.
 *   3. null — pressure does not apply.
 *
 * Returns null when pressure is disabled, no upstream matches, and no route override fires.
 */
export function resolveResourceId(
  method: string,
  url: string,
  config: GatewayConfig,
): ResolvedPressure {
  const pressure: PressureConfig | undefined = config.pressure;
  if (!pressure || pressure.enabled === false) {
    return null;
  }

  // Strip query string before prefix matching.
  const path = url.split('?')[0] ?? url;
  const upperMethod = method.toUpperCase();

  // 1. per-route overrides (first match wins)
  for (const override of pressure.perRoute) {
    if (!path.startsWith(override.pathPrefix)) {
      continue;
    }
    if (override.methods && override.methods.length > 0) {
      const allowed = override.methods.some(m => m.toUpperCase() === upperMethod);
      if (!allowed) { continue; }
    }
    return { resource: override.resource, layer: 'route', override };
  }

  // 2. per-service via upstream prefix match
  for (const [name, upstream] of Object.entries(config.upstreams)) {
    if (path.startsWith(upstream.prefix)) {
      const limits = pressure.perService[name];
      if (!limits) { return null; }
      return { resource: `gateway:service:${name}`, layer: 'service', upstream: name };
    }
  }

  return null;
}
