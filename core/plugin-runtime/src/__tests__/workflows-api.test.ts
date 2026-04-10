/**
 * Tests for WorkflowsAPI adapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWorkflowsAPI, createNoopWorkflowsAPI } from '../api/workflows.js';
import type { IWorkflowEngine, WorkflowRun } from '@kb-labs/core-platform';

describe('WorkflowsAPI', () => {
  describe('createWorkflowsAPI', () => {
    let mockEngine: IWorkflowEngine;

    beforeEach(() => {
      mockEngine = {
        execute: vi.fn(),
        getStatus: vi.fn(),
        cancel: vi.fn(),
        retry: vi.fn(),
        list: vi.fn(),
      };
    });

    it('should run workflow and return run ID', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: { foo: 'bar' },
        steps: [],
      };

      vi.mocked(mockEngine.execute).mockResolvedValue(mockRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      const runId = await api.run('test-workflow', { foo: 'bar' });

      expect(runId).toBe('run-123');
      expect(mockEngine.execute).toHaveBeenCalledWith('test-workflow', { foo: 'bar' }, {
        tenantId: 'test-tenant',
        priority: undefined,
        timeout: undefined,
        tags: undefined,
      });
    });

    it('should pass options to engine.execute', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [],
      };

      vi.mocked(mockEngine.execute).mockResolvedValue(mockRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      await api.run('test-workflow', {}, {
        priority: 'high',
        timeout: 60000,
        tags: { env: 'test' },
        idempotencyKey: 'idem-123',
      });

      expect(mockEngine.execute).toHaveBeenCalledWith('test-workflow', {}, {
        tenantId: 'test-tenant',
        priority: 'high',
        timeout: 60000,
        tags: { env: 'test' },
      });
    });

    it('should wait for workflow completion', async () => {
      const completedRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'completed',
        input: {},
        output: { result: 'success' },
        steps: [],
      };

      vi.mocked(mockEngine.getStatus).mockResolvedValue(completedRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      const result = await api.wait('run-123', { timeout: 1000, pollInterval: 100 });

      expect(result).toEqual({ result: 'success' });
    });

    it('should throw if workflow fails during wait', async () => {
      const failedRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'failed',
        input: {},
        error: 'Something went wrong',
        steps: [],
      };

      vi.mocked(mockEngine.getStatus).mockResolvedValue(failedRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      await expect(
        api.wait('run-123', { timeout: 1000, pollInterval: 100 })
      ).rejects.toThrow('Workflow failed: Something went wrong');
    });

    it('should throw if workflow is cancelled during wait', async () => {
      const cancelledRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'cancelled',
        input: {},
        steps: [],
      };

      vi.mocked(mockEngine.getStatus).mockResolvedValue(cancelledRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      await expect(
        api.wait('run-123', { timeout: 1000, pollInterval: 100 })
      ).rejects.toThrow('Workflow cancelled');
    });

    it('should throw if workflow not found during wait', async () => {
      vi.mocked(mockEngine.getStatus).mockResolvedValue(null);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      await expect(
        api.wait('run-123', { timeout: 1000, pollInterval: 100 })
      ).rejects.toThrow('Workflow run not found: run-123');
    });

    it('should get workflow status', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [
          { id: '1', name: 'step-1', status: 'completed', input: {}, output: {} },
          { id: '2', name: 'step-2', status: 'running', input: {} },
        ],
      };

      vi.mocked(mockEngine.getStatus).mockResolvedValue(mockRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      const status = await api.status('run-123');

      expect(status).toEqual({
        id: 'run-123',
        workflowId: 'test-workflow',
        status: 'running',
        output: undefined,
        error: undefined,
        startedAt: undefined,
        completedAt: undefined,
        progress: 50, // 1 out of 2 steps completed
      });
    });

    it('should return null if workflow not found', async () => {
      vi.mocked(mockEngine.getStatus).mockResolvedValue(null);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      const status = await api.status('run-123');

      expect(status).toBeNull();
    });

    it('should cancel workflow', async () => {
      vi.mocked(mockEngine.cancel).mockResolvedValue();

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      await api.cancel('run-123');

      expect(mockEngine.cancel).toHaveBeenCalledWith('run-123');
    });

    it('should list workflows with filters', async () => {
      const mockRuns: WorkflowRun[] = [
        {
          id: 'run-1',
          workflowId: 'test-workflow',
          tenantId: 'test-tenant',
          status: 'completed',
          input: {},
          steps: [],
        },
        {
          id: 'run-2',
          workflowId: 'test-workflow',
          tenantId: 'test-tenant',
          status: 'running',
          input: {},
          steps: [],
        },
      ];

      vi.mocked(mockEngine.list).mockResolvedValue(mockRuns);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      const runs = await api.list({
        workflowId: 'test-workflow',
        status: 'completed',
        limit: 10,
      });

      expect(runs).toHaveLength(2);
      expect(mockEngine.list).toHaveBeenCalledWith({
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'completed',
        tags: undefined,
        limit: 10,
        offset: undefined,
      });
    });

    it('should calculate progress correctly', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [
          { id: '1', name: 'step-1', status: 'completed', input: {}, output: {} },
          { id: '2', name: 'step-2', status: 'failed', input: {}, error: 'Error' },
          { id: '3', name: 'step-3', status: 'skipped', input: {} },
          { id: '4', name: 'step-4', status: 'pending', input: {} },
        ],
      };

      vi.mocked(mockEngine.getStatus).mockResolvedValue(mockRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: true,
          },
        },
      });

      const status = await api.status('run-123');

      // 3 out of 4 steps are done (completed/failed/skipped)
      expect(status?.progress).toBe(75);
    });
  });

  describe('workflow permissions', () => {
    let mockEngine: IWorkflowEngine;

    beforeEach(() => {
      mockEngine = {
        execute: vi.fn(),
        getStatus: vi.fn(),
        cancel: vi.fn(),
        retry: vi.fn(),
        list: vi.fn(),
      };
    });

    it('should deny all operations when workflows permission is false', async () => {
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: false,
          },
        },
      });

      await expect(api.run('test', {})).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
      await expect(api.status('run-123')).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
      await expect(api.cancel('run-123')).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
      await expect(api.list()).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
    });

    it('should deny all operations when workflows permission is undefined', async () => {
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {},
        },
      });

      await expect(api.run('test', {})).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
      await expect(api.status('run-123')).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
      await expect(api.cancel('run-123')).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
      await expect(api.list()).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
    });

    it('should deny all operations when permissions object is undefined', async () => {
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: undefined,
      });

      await expect(api.run('test', {})).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
      await expect(api.status('run-123')).rejects.toThrow(
        'Workflow engine access denied: missing platform.workflows permission'
      );
    });

    it('should allow specific operations with granular permissions', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [],
      };

      vi.mocked(mockEngine.execute).mockResolvedValue(mockRun);
      vi.mocked(mockEngine.getStatus).mockResolvedValue(mockRun);
      vi.mocked(mockEngine.list).mockResolvedValue([mockRun]);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: {
              run: true,
              list: true,
              cancel: false, // No cancel permission
            },
          },
        },
      });

      // Should allow run
      const runId = await api.run('test-workflow', {});
      expect(runId).toBe('run-123');

      // Should allow status (uses list permission)
      const status = await api.status('run-123');
      expect(status).toBeDefined();

      // Should allow list
      const runs = await api.list();
      expect(runs).toHaveLength(1);

      // Should deny cancel
      await expect(api.cancel('run-123')).rejects.toThrow(
        "Workflow operation 'cancel' denied: missing platform.workflows.cancel permission"
      );
    });

    it('should deny specific operations when granular permission is missing', async () => {
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: {
              run: false,
              list: true,
              cancel: true,
            },
          },
        },
      });

      // Should deny run
      await expect(api.run('test-workflow', {})).rejects.toThrow(
        "Workflow operation 'run' denied: missing platform.workflows.run permission"
      );

      // Should allow status (uses list permission)
      vi.mocked(mockEngine.getStatus).mockResolvedValue({
        id: 'run-123',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [],
      });
      const status = await api.status('run-123');
      expect(status).toBeDefined();

      // Should allow cancel
      await api.cancel('run-123');
      expect(mockEngine.cancel).toHaveBeenCalledWith('run-123');
    });

    it('should allow workflows matching workflowIds scope', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'analytics-reports',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [],
      };

      vi.mocked(mockEngine.execute).mockResolvedValue(mockRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: {
              run: true,
              workflowIds: ['analytics-*', 'reports-*'],
            },
          },
        },
      });

      // Should allow analytics-reports (matches analytics-*)
      const runId = await api.run('analytics-reports', {});
      expect(runId).toBe('run-123');

      // Should allow reports-daily (matches reports-*)
      await api.run('reports-daily', {});
      expect(mockEngine.execute).toHaveBeenCalledTimes(2);
    });

    it('should deny workflows not matching workflowIds scope', async () => {
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: {
              run: true,
              workflowIds: ['analytics-*'],
            },
          },
        },
      });

      // Should deny cleanup-old-data (doesn't match analytics-*)
      await expect(api.run('cleanup-old-data', {})).rejects.toThrow(
        "Workflow 'cleanup-old-data' access denied: not in allowed workflowIds scope"
      );
    });

    it('should allow all workflows with wildcard scope', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'any-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [],
      };

      vi.mocked(mockEngine.execute).mockResolvedValue(mockRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: {
              run: true,
              workflowIds: ['*'],
            },
          },
        },
      });

      // Should allow any workflow
      await api.run('any-workflow', {});
      await api.run('completely-different', {});
      expect(mockEngine.execute).toHaveBeenCalledTimes(2);
    });

    it('should allow workflows when workflowIds is not specified', async () => {
      const mockRun: WorkflowRun = {
        id: 'run-123',
        workflowId: 'any-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [],
      };

      vi.mocked(mockEngine.execute).mockResolvedValue(mockRun);

      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: {
              run: true,
              // No workflowIds specified = all allowed
            },
          },
        },
      });

      // Should allow any workflow when workflowIds is not specified
      await api.run('any-workflow', {});
      expect(mockEngine.execute).toHaveBeenCalledTimes(1);
    });

    it('should deny targeted workflow run when target namespace is missing', async () => {
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: { run: true },
            execution: { targetUse: true, namespaces: ['demo/*'] },
          },
        },
      });

      await expect(
        api.run('test-workflow', {}, {
          target: { environmentId: 'env-1' },
        })
      ).rejects.toThrow('Target namespace is required when workflow target is specified');
    });

    it('should deny targeted workflow run outside execution namespace scope', async () => {
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: { run: true },
            execution: { targetUse: true, namespaces: ['team-a/*'] },
          },
        },
      });

      await expect(
        api.run('test-workflow', {}, {
          target: { environmentId: 'env-1', namespace: 'team-b/dev' },
        })
      ).rejects.toThrow(
        "Target namespace 'team-b/dev' denied: not in allowed execution namespaces scope"
      );
    });

    it('should call target execution audit callback for targeted workflow run', async () => {
      vi.mocked(mockEngine.execute).mockResolvedValue({
        id: 'run-target-1',
        workflowId: 'test-workflow',
        tenantId: 'test-tenant',
        status: 'running',
        input: {},
        steps: [],
      });

      const auditTargetExecution = vi.fn(async () => undefined);
      const api = createWorkflowsAPI({
        tenantId: 'test-tenant',
        engine: mockEngine,
        permissions: {
          platform: {
            workflows: { run: true },
            execution: { targetUse: true, namespaces: ['demo/*'] },
          },
        },
        auditTargetExecution,
      });

      await api.run('test-workflow', {}, {
        target: { environmentId: 'env-1', namespace: 'demo/dev' },
      });

      expect(auditTargetExecution).toHaveBeenCalledWith({
        method: 'workflow',
        workflowId: 'test-workflow',
        target: {
          environmentId: 'env-1',
          namespace: 'demo/dev',
        },
      });
      expect(mockEngine.execute).toHaveBeenCalledWith(
        'test-workflow',
        {},
        expect.objectContaining({
          target: {
            environmentId: 'env-1',
            namespace: 'demo/dev',
          },
        })
      );
    });
  });

  describe('createNoopWorkflowsAPI', () => {
    it('should throw on all operations', async () => {
      const api = createNoopWorkflowsAPI();

      await expect(api.run('test', {})).rejects.toThrow('Workflow engine not available');
      await expect(api.wait('run-123')).rejects.toThrow('Workflow engine not available');
      await expect(api.status('run-123')).rejects.toThrow('Workflow engine not available');
      await expect(api.cancel('run-123')).rejects.toThrow('Workflow engine not available');
      await expect(api.list()).rejects.toThrow('Workflow engine not available');
    });
  });
});
