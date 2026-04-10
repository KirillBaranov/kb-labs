/**
 * Test RPS (requests per second) rate limiting.
 */

import { describe, it, expect } from 'vitest';
import { ResourceBroker, InMemoryRateLimitBackend } from '@kb-labs/core-resource-broker';

describe('ResourceBroker RPS', () => {
  it('should enforce 1 request per second using requestsPerSecond', async () => {
    const backend = new InMemoryRateLimitBackend();
    const broker = new ResourceBroker(backend);

    const executionTimes: number[] = [];

    // Use requestsPerSecond = 2 (with safetyMargin 0.9 → effective = 1 per second)
    broker.register('test', {
      rateLimits: { requestsPerSecond: 2 }, // 2 RPS * 0.9 = 1.8 → floor = 1 RPS effective
      executor: async (op, args) => {
        const now = Date.now();
        executionTimes.push(now);
        console.log(`[${executionTimes.length}] Executed at ${now}ms, args:`, args);
        return `result-${args[0]}`;
      },
    });

    const start = Date.now();
    console.log(`Start: ${start}ms`);

    const promises = [
      broker.enqueue({ resource: 'test', operation: 'op', args: [1], priority: 'normal' }),
      broker.enqueue({ resource: 'test', operation: 'op', args: [2], priority: 'normal' }),
      broker.enqueue({ resource: 'test', operation: 'op', args: [3], priority: 'normal' }),
    ];

    await Promise.all(promises);
    const duration = Date.now() - start;

    console.log(`Duration: ${duration}ms`);
    console.log(`Execution times:`, executionTimes);
    if (executionTimes.length >= 2) {
      console.log(`Gap 1-2: ${executionTimes[1]! - executionTimes[0]!}ms`);
    }
    if (executionTimes.length >= 3) {
      console.log(`Gap 2-3: ${executionTimes[2]! - executionTimes[1]!}ms`);
    }

    // With 2 RPS and safetyMargin=0.9: effective = floor(1.8) = 1 RPS
    // Expecting ~1 second gaps between requests
    expect(duration).toBeGreaterThanOrEqual(1800); // ~2s total
  }, 15000);
});
