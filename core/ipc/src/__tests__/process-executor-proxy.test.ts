import { describe, expect, it, vi } from 'vitest';
import type { AdapterCall, AdapterResponse } from '@kb-labs/core-platform/serializable';
import { deserialize, serialize } from '@kb-labs/core-platform/serializable';
import type { GovernedProcessRequest, ProcessResult } from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport.js';
import { ProcessExecutorProxy } from '../proxy/process-executor-proxy.js';

function transportFor(result: ProcessResult): ITransport & { calls: AdapterCall[] } {
  const calls: AdapterCall[] = [];
  return {
    calls,
    send: vi.fn(async (call: AdapterCall): Promise<AdapterResponse> => {
      calls.push(call);
      return { type: 'adapter:response', requestId: call.requestId, result: serialize(call.method === 'execute' ? result : undefined) };
    }),
    sendMessage: vi.fn(), onPushMessage: vi.fn(() => () => {}), close: vi.fn(async () => {}), isClosed: vi.fn(() => false),
  };
}

describe('ProcessExecutorProxy', () => {
  it('forwards execution to the host and never serializes AbortSignal', async () => {
    const transport = transportFor({ processId: 'host-process', code: 0, stdout: 'ok', stderr: '', ok: true, terminationReason: 'completed', attempts: 1, usage: { wallTimeMs: 1, cpuMs: 0, peakMemoryMb: 1, processCount: 1, stdoutBytes: 2, stderrBytes: 0 } });
    const proxy = new ProcessExecutorProxy(transport);
    const controller = new AbortController();
    const request: GovernedProcessRequest = { identity: { executionId: 'e1', requestId: 'r1', pluginId: 'p1' }, command: 'echo', args: ['ok'], cwd: process.cwd(), signal: controller.signal, limits: { timeoutMs: 1000 } };
    const result = await proxy.execute(request);
    expect(result.stdout).toBe('ok');
    const call = transport.calls[0]!;
    expect(call.adapter).toBe('processExecutor');
    expect(call.method).toBe('execute');
    const forwarded = deserialize(call.args[0]!) as Record<string, unknown>;
    expect(forwarded.signal).toBeUndefined();
    expect(forwarded.processId).toEqual(expect.any(String));
  });

  it('maps cancellation to a host-side cancel operation', async () => {
    const transport = transportFor({ processId: 'host-process', code: 0, stdout: '', stderr: '', ok: true, terminationReason: 'completed', attempts: 1, usage: { wallTimeMs: 1, cpuMs: 0, peakMemoryMb: 1, processCount: 1, stdoutBytes: 0, stderrBytes: 0 } });
    const proxy = new ProcessExecutorProxy(transport);
    await proxy.cancel('remote-process', 'cancelled');
    expect(transport.calls[0]).toMatchObject({ adapter: 'processExecutor', method: 'cancel' });
    expect(deserialize(transport.calls[0]!.args[0]!)).toBe('remote-process');
  });
});
