/**
 * Unit tests for KBTelemetry client.
 *
 * Covers:
 *   - event() buffers events
 *   - flush() sends batch to endpoint
 *   - metric() and log() convenience methods
 *   - Auto-flush when buffer reaches batchSize
 *   - Retry on server error
 *   - defaultTags merged into events
 *   - shutdown() flushes and stops timer
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KBTelemetry } from '../index.js';

// ── Mock fetch ────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockFetchOk(accepted = 1, rejected = 0) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ accepted, rejected }),
  });
}

function mockFetchError(status = 500) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    text: async () => 'Internal Server Error',
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('KBTelemetry', () => {
  let client: KBTelemetry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    // Restore real timers before shutdown to avoid timer-related hangs
    vi.useRealTimers();
    if (client) {await client.shutdown();}
  });

  function createClient(overrides: Record<string, unknown> = {}) {
    client = new KBTelemetry({
      endpoint: 'http://localhost:4000',
      apiKey: 'test-key',
      source: 'test-product',
      flushIntervalMs: 0, // Disable auto-flush for deterministic tests
      ...overrides,
    });
    return client;
  }

  // ── Buffering ─────────────────────────────────────────────────────────

  it('buffers events without sending until flush()', () => {
    const c = createClient();
    c.event('user.signup', { plan: 'pro' });
    c.event('user.login');

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('flush() sends buffered events to ingestion endpoint', async () => {
    mockFetchOk(2);
    const c = createClient();

    c.event('user.signup', { plan: 'pro' });
    c.event('user.login');
    await c.flush();

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/telemetry/v1/ingest');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-key');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.events).toHaveLength(2);
    expect(body.events[0].source).toBe('test-product');
    expect(body.events[0].type).toBe('user.signup');
    expect(body.events[0].payload).toEqual({ plan: 'pro' });
    expect(body.events[1].type).toBe('user.login');
  });

  it('flush() is no-op when buffer is empty', async () => {
    const c = createClient();
    await c.flush();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Convenience methods ───────────────────────────────────────────────

  it('metric() creates event with type "metric"', async () => {
    mockFetchOk();
    const c = createClient();

    c.metric('api_latency_ms', 142, { endpoint: '/checkout' });
    await c.flush();

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.events[0].type).toBe('metric');
    expect(body.events[0].payload.name).toBe('api_latency_ms');
    expect(body.events[0].payload.value).toBe(142);
    expect(body.events[0].tags.endpoint).toBe('/checkout');
  });

  it('log() creates event with type "log"', async () => {
    mockFetchOk();
    const c = createClient();

    c.log('error', 'Payment failed', { orderId: '123' });
    await c.flush();

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.events[0].type).toBe('log');
    expect(body.events[0].payload.level).toBe('error');
    expect(body.events[0].payload.message).toBe('Payment failed');
    expect(body.events[0].payload.orderId).toBe('123');
  });

  // ── Auto-flush on batch size ──────────────────────────────────────────

  it('auto-flushes when buffer reaches batchSize', async () => {
    mockFetchOk(3);
    const c = createClient({ batchSize: 3 });

    c.event('a');
    c.event('b');
    // Third event triggers auto-flush
    c.event('c');

    // Wait for async flush
    await vi.advanceTimersByTimeAsync(0);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.events).toHaveLength(3);
  });

  // ── Default tags ──────────────────────────────────────────────────────

  it('merges defaultTags into all events', async () => {
    mockFetchOk();
    const c = createClient({ defaultTags: { env: 'prod', region: 'eu' } });

    c.event('deploy', undefined, { version: '1.2.3' });
    await c.flush();

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.events[0].tags).toEqual({
      env: 'prod',
      region: 'eu',
      version: '1.2.3',
    });
  });

  it('per-event tags override defaultTags', async () => {
    mockFetchOk();
    const c = createClient({ defaultTags: { env: 'staging' } });

    c.event('deploy', undefined, { env: 'prod' });
    await c.flush();

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.events[0].tags.env).toBe('prod');
  });

  // ── Retry ─────────────────────────────────────────────────────────────

  it('retries on server error (up to maxRetries)', async () => {
    mockFetchError(500);
    const onError = vi.fn();
    const c = createClient({ maxRetries: 1, onError });

    c.event('test');

    // flush() calls sleep() which uses setTimeout — advance fake timers
    const flushPromise = c.flush();
    await vi.advanceTimersByTimeAsync(10000); // enough for retry backoff
    await flushPromise;

    // 1 initial + 1 retry = 2 calls
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  // ── Shutdown ──────────────────────────────────────────────────────────

  it('shutdown() flushes remaining events', async () => {
    mockFetchOk();
    const c = createClient();

    c.event('pending1');
    c.event('pending2');
    await c.shutdown();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.events).toHaveLength(2);
  });

  // ── Timestamp ─────────────────────────────────────────────────────────

  it('includes ISO timestamp on each event', async () => {
    mockFetchOk();
    const c = createClient();

    c.event('test');
    await c.flush();

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    const ts = body.events[0].timestamp;
    expect(ts).toBeDefined();
    expect(new Date(ts).getTime()).toBeGreaterThan(0);
  });

  // ── Endpoint normalization ────────────────────────────────────────────

  it('strips trailing slash from endpoint', async () => {
    mockFetchOk();
    client = new KBTelemetry({
      endpoint: 'http://localhost:4000/',
      apiKey: 'key',
      source: 'test',
      flushIntervalMs: 0,
    });

    client.event('test');
    await client.flush();

    const url = mockFetch.mock.calls[0]![0];
    expect(url).toBe('http://localhost:4000/telemetry/v1/ingest');
  });
});
