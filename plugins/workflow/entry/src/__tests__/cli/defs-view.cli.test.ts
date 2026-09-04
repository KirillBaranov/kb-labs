import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockCLIInput, createCapturedUI, createMockContext } from '@kb-labs/shared-testing-e2e/cli';
import { makeClient, defaultWorkflowClient } from '../helpers/defaults.js';

vi.mock('../../http-client.js', () => ({
  WorkflowDaemonClient: vi.fn(),
}));

import { WorkflowDaemonClient } from '../../http-client.js';
import type { WorkflowInfo } from '@kb-labs/workflow-contracts';
import defsViewCommand from '../../commands/defs-view.js';

const MockedClient = vi.mocked(WorkflowDaemonClient);

const sampleWorkflow: WorkflowInfo = {
  id: 'release-manager/create-release',
  name: 'Create Release',
  description: 'Cuts a new release',
  source: 'manifest',
  status: 'active',
  tags: ['release', 'ci'],
  version: '1.2.0',
  inputs: {
    environment: { type: 'string', required: true, description: 'Target environment' },
    dryRun: { type: 'boolean', required: false, default: false },
  },
};

beforeEach(() => {
  MockedClient.mockReset();
});

describe('workflow:defs view', () => {
  it('DV-01: renders sideBox with workflow details', async () => {
    const getWorkflow = vi.fn().mockResolvedValue(sampleWorkflow);
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, getWorkflow }));

    const { ui } = createCapturedUI();
    const sideBoxSpy = vi.spyOn(ui, 'sideBox');
    const ctx = createMockContext({ ui });
    const result = await defsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['release-manager/create-release'], flags: {} }),
    );

    expect(result.ok).toBe(true);
    expect(getWorkflow).toHaveBeenCalledWith('release-manager/create-release');
    const allText = sideBoxSpy.mock.calls
      .flatMap(([opts]) => (opts.sections ?? []).flatMap((sec: { items: string[] }) => sec.items))
      .join('\n');
    expect(allText).toContain('Source:  manifest');
    expect(allText).toContain('Status:  active');
    expect(allText).toContain('Description: Cuts a new release');
    expect(allText).toContain('Version: 1.2.0');
    expect(allText).toContain('environment: string (required)');
    expect(allText).toContain('dryRun: boolean');
  });

  it('DV-02: --json outputs { ok: true, data: WorkflowInfo }', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getWorkflow: vi.fn().mockResolvedValue(sampleWorkflow),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await defsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['release-manager/create-release'], flags: { json: true } }),
    );

    expect(result.ok).toBe(true);
    expect(captured.json[0]).toMatchObject({ ok: true, data: sampleWorkflow });
  });

  it('DV-03: --id flag works as alias for positional argument', async () => {
    const getWorkflow = vi.fn().mockResolvedValue(sampleWorkflow);
    MockedClient.mockImplementation(() => makeClient({ ...defaultWorkflowClient, getWorkflow }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await defsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: [], flags: { id: 'e2e-hello' } }),
    );

    expect(result.ok).toBe(true);
    expect(getWorkflow).toHaveBeenCalledWith('e2e-hello');
  });

  it('DV-04: missing id returns exitCode 1 and validation error', async () => {
    MockedClient.mockImplementation(() => makeClient(defaultWorkflowClient));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await defsViewCommand.execute(ctx, mockCLIInput({ argv: [], flags: {} }));

    expect(result.ok).toBe(false);
    expect(captured.errors.length + captured.warnings.length).toBeGreaterThan(0);
  });

  it('DV-05: workflow not found (404) returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getWorkflow: vi.fn().mockRejectedValue(new Error('Workflow missing-id not found')),
    }));

    const { ui, captured } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await defsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['missing-id'], flags: {} }),
    );

    expect(result.ok).toBe(false);
    expect(captured.errors.length).toBeGreaterThan(0);
  });

  it('DV-06: daemon unavailable returns exitCode 1', async () => {
    MockedClient.mockImplementation(() => makeClient({
      ...defaultWorkflowClient,
      getWorkflow: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    }));

    const { ui } = createCapturedUI();
    const ctx = createMockContext({ ui });
    const result = await defsViewCommand.execute(
      ctx,
      mockCLIInput({ argv: ['some-id'], flags: {} }),
    );

    expect(result.ok).toBe(false);
  });
});
