/**
 * @module pressure/register-limits
 * Boot-time registration of pressure limits with the platform ResourceBroker.
 *
 * Idempotent: safe to call more than once (relies on `IResourceBroker.registerLimit`
 * being a `Map.set` overwrite — see ADR-0056).
 */

import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import type { ILogger } from '@kb-labs/core-platform';
import type { PressureConfig } from '@kb-labs/gateway-contracts';

export interface RegisterPressureLimitsResult {
  perServiceRegistered: number;
  perRouteRegistered: number;
  perTenantEnabled: boolean;
}

export function registerPressureLimits(
  broker: IResourceBroker,
  config: PressureConfig | undefined,
  logger: ILogger,
): RegisterPressureLimitsResult {
  if (!config || config.enabled === false) {
    return { perServiceRegistered: 0, perRouteRegistered: 0, perTenantEnabled: false };
  }

  let perServiceRegistered = 0;
  for (const [name, limits] of Object.entries(config.perService)) {
    broker.registerLimit(`gateway:service:${name}`, limits);
    perServiceRegistered++;
  }

  let perRouteRegistered = 0;
  for (const override of config.perRoute) {
    broker.registerLimit(override.resource, override.limits);
    perRouteRegistered++;
  }

  const perTenantEnabled = config.perTenant?.enabled === true;

  logger.info('pressure.boot', {
    event: 'pressure.boot',
    perService: perServiceRegistered,
    perRoute: perRouteRegistered,
    perTenant: perTenantEnabled,
  });

  return { perServiceRegistered, perRouteRegistered, perTenantEnabled };
}
