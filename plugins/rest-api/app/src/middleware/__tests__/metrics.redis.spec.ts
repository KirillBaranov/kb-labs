import { describe, expect, it } from 'vitest'
import { metricsCollector } from '../metrics'

type RedisStatus = {
  enabled: boolean;
  healthy: boolean;
  roles: { publisher?: string | null; subscriber?: string | null; cache?: string | null };
};

function redisStatus(overrides: Partial<RedisStatus> = {}): RedisStatus {
  const baseRoles: RedisStatus['roles'] = {
    publisher: 'ready',
    subscriber: 'subscribed',
    cache: null,
  }

  const roles: RedisStatus['roles'] = {
    publisher: overrides.roles?.publisher ?? baseRoles.publisher,
    subscriber: overrides.roles?.subscriber ?? baseRoles.subscriber,
    cache: overrides.roles?.cache ?? baseRoles.cache,
  }

  return {
    enabled: overrides.enabled ?? true,
    healthy: overrides.healthy ?? true,
    roles,
  }
}

describe('metricsCollector.recordRedisStatus', () => {
  it('tracks redis health transitions and role states', () => {
    metricsCollector.reset()

    const initial = redisStatus()
    const degraded = redisStatus({
      healthy: false,
      roles: { publisher: 'reconnecting', subscriber: 'reconnecting', cache: 'stale' },
    })

    metricsCollector.recordRedisStatus(initial)
    metricsCollector.recordRedisStatus(degraded)

    const snapshot = metricsCollector.getMetrics().redis

    expect(snapshot.updates).toBe(2)
    expect(snapshot.healthyTransitions).toBe(0)
    expect(snapshot.unhealthyTransitions).toBe(1)
    expect(snapshot.lastStatus).toMatchObject({
      enabled: true,
      healthy: false,
      roles: {
        publisher: 'reconnecting',
        subscriber: 'reconnecting',
        cache: 'stale',
      },
    })

    const publisherStates = snapshot.roleStates.find((entry) => entry.role === 'publisher')
    expect(publisherStates?.states.find((state) => state.state === 'ready')?.count).toBe(1)
    expect(publisherStates?.states.find((state) => state.state === 'reconnecting')?.count).toBe(1)
  })
})


