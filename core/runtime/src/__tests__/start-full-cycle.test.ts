import { describe, it, expect, vi } from 'vitest';
import { startFullCycle } from '../use-cases/start-full-cycle.js';

describe('startFullCycle', () => {
  it('delegates execution to run orchestrator', async () => {
    const expected = {
      runId: 'run-1',
      status: 'queued',
      taskRef: 'TASK-1',
      templateId: 'full-cycle.default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const runOrchestrator = {
      startFullCycle: vi.fn(async () => expected),
    };

    const result = await startFullCycle(
      { runOrchestrator } as any,
      {
        run: {
          taskRef: 'TASK-1',
          templateId: 'full-cycle.default',
        },
        environment: {},
      }
    );

    expect(result).toEqual(expected);
    expect(runOrchestrator.startFullCycle).toHaveBeenCalledTimes(1);
  });
});

