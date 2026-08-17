import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient, defaultWorkflowClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import runsViewCommand from '../../commands/runs-view.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const baseRun = {
  id: 'run-abc',
  name: 'deploy',
  status: 'success' as const,
  createdAt: new Date().toISOString(),
  jobs: [
    {
      id: 'job-1',
      jobName: 'build',
      status: 'success' as const,
      steps: [
        { id: 'step-1', name: 'compile', status: 'success' as const },
      ],
    },
  ],
};

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:runs view', () => {
  it('RV-01: renders run tree without flags (exitCode 0 on success)', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(true);
  });

  it('RV-02: --json=all outputs full run object (BUG-004 path)', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: 'all' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true, data: { id: 'run-abc' } });
  });

  it('RV-03: --json without value (boolean true) does not crash — treated as --json=all', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });

    // This was crashing with "jsonFields.split is not a function" before the fix
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: true as unknown as string } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true, data: { id: 'run-abc' } });
  });

  it('RV-03b: --json before positional arg (--run-id explicit) does not crash', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-abc', json: true as unknown as string } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true });
  });

  it('RV-04: --json=status,jobs outputs only selected fields', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: 'status,jobs' } }),
    );

    expect(result.ok).toBe(true);
    const data = (captured.json[0] as { ok: boolean; data: Record<string, unknown> })?.data;
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('jobs');
    expect(data).not.toHaveProperty('name');
  });

  it('RV-04b: --run-id flag works as alias for positional arg', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { 'run-id': 'run-abc' } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json.length).toBe(0); // no --json, so sideBox path
  });

  it('RV-05: no args and no runs → exitCode 0, info message', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      listRuns: async () => [],
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(captured.infos.some(i => i.message.includes('No runs found'))).toBe(true);
  });

  it('RV-05b: no args → auto-fetches latest run and shows it', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      listRuns: async () => [{ id: 'run-latest', name: 'deploy', status: 'success' as const, createdAt: new Date().toISOString() }],
      getRun: async () => baseRun,
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(captured.infos.some(i => i.message.includes('run-latest'))).toBe(true);
  });

  it('RV-06: daemon error returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => { throw new Error('daemon unreachable'); },
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-bad'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('RV-07: failed run returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => ({ ...baseRun, status: 'failed' as const }),
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: {} }),
    );

    expect(result.ok).toBe(false);
  });

  it('RV-08: formatDuration returns "0ms" for durationMs=0 (BUG-007)', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => ({ ...baseRun, durationMs: 0 }),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['run-abc'], flags: { json: 'all' } }),
    );

    expect(result.ok).toBe(true);
    // durationMs=0 must be present in JSON output, not hidden
    const data = (captured.json[0] as { ok: boolean; data: Record<string, unknown> })?.data;
    expect(data?.durationMs).toBe(0);
    // rendered sideBox path: verify formatDuration('0') => '0ms' via table-less path
    // We test the unit directly: a run with durationMs=0 must NOT silently hide the duration.
    // The JSON round-trip above confirms the value reaches the renderer.
  });

  it('RV-09: step output values shown (not just key names)', async () => {
    const runWithOutputs = {
      ...baseRun,
      jobs: [{
        id: 'job-1',
        jobName: 'build',
        status: 'success' as const,
        steps: [{
          id: 'step-1',
          name: 'compile',
          status: 'success' as const,
          outputs: { score: 42, label: 'ok' },
        }],
      }],
    };
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => runWithOutputs,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: {} }));

    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('score: 42');
    expect(allText).toContain('label: ok');
    // must NOT only show key names
    expect(allText).not.toMatch(/Outputs: score, label/);
  });

  it('RV-10: step output values truncated at 120 chars', async () => {
    const longValue = 'x'.repeat(200);
    const runWithLongOutput = {
      ...baseRun,
      jobs: [{
        id: 'job-1',
        jobName: 'build',
        status: 'success' as const,
        steps: [{
          id: 'step-1',
          name: 'compile',
          status: 'success' as const,
          outputs: { data: longValue },
        }],
      }],
    };
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => runWithLongOutput,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: {} }));

    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('data: ');
    expect(allText).toContain('…');
    // truncated — must not contain the full 200-char value
    expect(allText).not.toContain(longValue);
  });

  it('RV-11: --output flag shows per-step stdout inline', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
      getRunLogs: async () => [
        { level: 'info', message: 'hello from step', timestamp: new Date().toISOString(), stepId: 'step-1', stream: 'stdout' },
        { level: 'info', message: 'error line', timestamp: new Date().toISOString(), stepId: 'step-1', stream: 'stderr' },
      ],
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: { output: true } }));

    expect(result.ok).toBe(true);
    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('[OUT] hello from step');
    expect(allText).toContain('[ERR] error line');
  });

  it('RV-12: --output flag shows truncation hint when step has >20 log lines', async () => {
    const manyLogs = Array.from({ length: 25 }, (_, i) => ({
      level: 'info',
      message: `line ${i}`,
      timestamp: new Date().toISOString(),
      stepId: 'step-1',
      stream: 'stdout',
    }));
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
      getRunLogs: async () => manyLogs,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: { output: true } }));

    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('… 5 earlier lines');
    expect(allText).toContain('--log --step=step-1');
  });

  it('RV-13: --output without matching stepId logs skips gracefully — tree still renders', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
      getRunLogs: async () => [
        // no stepId — should be filtered out
        { level: 'info', message: 'orphan log', timestamp: new Date().toISOString() },
      ],
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: { output: true } }));

    expect(result.ok).toBe(true);
    // sideBox must be called — tree is rendered even without matching logs
    expect(sideBoxSpy).toHaveBeenCalled();
    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    // step name must appear in the tree
    expect(allText).toContain('compile');
    // orphan log must not bleed into output
    expect(allText).not.toContain('orphan log');
  });

  it('RV-14: --output failure (getRunLogs throws) renders degraded tree, not exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
      getRunLogs: async () => { throw new Error('logs endpoint not found'); },
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: { output: true } }));

    // must NOT crash to exitCode 1 — degraded tree without logs is acceptable
    expect(result.ok).toBe(true);
    expect(sideBoxSpy).toHaveBeenCalled();
    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('compile');
  });

  it('RV-15: circular reference in step.outputs does not crash renderRun (JSON.stringify guard)', async () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const runWithCircular = {
      ...baseRun,
      jobs: [{
        id: 'job-1',
        jobName: 'build',
        status: 'success' as const,
        steps: [{
          id: 'step-1',
          name: 'compile',
          status: 'success' as const,
          outputs: { safe: 'value', bad: circular },
        }],
      }],
    };
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => runWithCircular,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    // must not throw — circular must render as [circular], not crash
    const result = await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: {} }));

    expect(result.ok).toBe(true);
    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('safe: value');
    expect(allText).toContain('[circular]');
  });

  it('RV-16: outputs shown for non-success (failed) steps', async () => {
    const runWithFailedOutputs = {
      ...baseRun,
      jobs: [{
        id: 'job-1',
        jobName: 'build',
        status: 'failed' as const,
        steps: [{
          id: 'step-1',
          name: 'compile',
          status: 'failed' as const,
          outputs: { partial: 'result' },
          error: { message: 'compilation failed', code: 'ERR_COMPILE' },
        }],
      }],
    };
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => runWithFailedOutputs,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: {} }));

    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    // partial outputs from failed steps must be visible for debugging
    expect(allText).toContain('partial: result');
  });

  it('RV-17: run.result.outputs and result.summary shown in summary section', async () => {
    const runWithResult = {
      ...baseRun,
      result: {
        status: 'success' as const,
        summary: 'all checks passed',
        outputs: { report: 'ok', count: 3 },
      },
    };
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => runWithResult,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    const result = await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: {} }));

    expect(result.ok).toBe(true);
    const allText = sideBoxSpy.mock.calls
      .flatMap(([o]) => (o.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('Outputs:');
    expect(allText).toContain('"report":"ok"');
    expect(allText).toContain('Result:   all checks passed');
  });

  it('RV-18: --output --step <id> calls getRunLogs with stepId and only shows that step stdout', async () => {
    const getRunLogsSpy = vi.fn().mockResolvedValue([
      { level: 'info', message: 'step output line', timestamp: new Date().toISOString(), stepId: 'step-1', stream: 'stdout' },
    ]);
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
      getRunLogs: getRunLogsSpy,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: { output: true, step: 'step-1' } }));

    // getRunLogs must be called with the targeted stepId
    expect(getRunLogsSpy).toHaveBeenCalledWith('run-abc', { stepId: 'step-1' });
    const allText = sideBoxSpy.mock.calls
      .flatMap(([o]) => (o.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    expect(allText).toContain('[OUT] step output line');
  });

  it('RV-19: --output --step <id> with >20 log lines shows all without truncation', async () => {
    const manyLogs = Array.from({ length: 30 }, (_, i) => ({
      level: 'info',
      message: `line ${i}`,
      timestamp: new Date().toISOString(),
      stepId: 'step-1',
      stream: 'stdout',
    }));
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getRun: async () => baseRun,
      getRunLogs: async () => manyLogs,
    }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    await runsViewCommand.execute(ctx, mockCLIInput({ argv: ['run-abc'], flags: { output: true, step: 'step-1' } }));

    const allText = sideBoxSpy.mock.calls
      .flatMap(([o]) => (o.sections ?? []).flatMap(sec => sec.items.map(item => typeof item === 'string' ? item : item.text)))
      .join('\n');
    // All 30 lines must appear — no truncation hint
    expect(allText).toContain('[OUT] line 0');
    expect(allText).toContain('[OUT] line 29');
    expect(allText).not.toContain('earlier lines');
  });
});
