/**
 * @module @kb-labs/plugin-contracts/logger-metadata.test
 * Unit tests for logger metadata extraction from host context
 */

import { describe, it, expect } from 'vitest';
import { getLoggerMetadataFromHost } from './logger-metadata';
import type {
  RestHostContext,
  CliHostContext,
  WorkflowHostContext,
  WebhookHostContext,
  CronHostContext,
} from './host-context';

describe('getLoggerMetadataFromHost', () => {
  describe('REST host context', () => {
    it('should extract all REST fields', () => {
      const context: RestHostContext = {
        host: 'rest',
        method: 'POST',
        path: '/api/v1/plugins/commit/generate',
        requestId: 'req-abc123',
        traceId: 'trace-xyz789',
        tenantId: 'acme-corp',
        headers: {
          'content-type': 'application/json',
        },
        body: { scope: '@kb-labs/workflow' },
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'rest',
        reqId: 'req-abc123',
        traceId: 'trace-xyz789',
        tenantId: 'acme-corp',
        method: 'POST',
        url: '/api/v1/plugins/commit/generate',
      });
    });

    it('should handle missing optional fields', () => {
      const context: RestHostContext = {
        host: 'rest',
        method: 'GET',
        path: '/health',
        requestId: 'req-123',
        traceId: 'trace-456',
        // tenantId is optional
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'rest',
        reqId: 'req-123',
        traceId: 'trace-456',
        tenantId: undefined,
        method: 'GET',
        url: '/health',
      });
    });
  });

  describe('CLI host context', () => {
    it('should extract CLI fields', () => {
      const context: CliHostContext = {
        host: 'cli',
        argv: ['kb', 'workflow:run', '--workflow-id', 'my-flow'],
        flags: { workflowId: 'my-flow' },
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'cli',
        argv: ['kb', 'workflow:run', '--workflow-id', 'my-flow'],
      });
    });

    it('should handle empty argv', () => {
      const context: CliHostContext = {
        host: 'cli',
        argv: [],
        flags: {},
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'cli',
        argv: [],
      });
    });
  });

  describe('Workflow host context', () => {
    it('should extract all workflow fields', () => {
      const context: WorkflowHostContext = {
        host: 'workflow',
        workflowId: 'wf-123',
        runId: 'run-456',
        stepId: 'step-789',
        jobId: 'job-abc',
        attempt: 2,
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'workflow',
        workflowId: 'wf-123',
        runId: 'run-456',
        jobId: 'job-abc',
        stepId: 'step-789',
        attempt: 2,
      });
    });

    it('should handle missing optional workflow fields', () => {
      const context: WorkflowHostContext = {
        host: 'workflow',
        workflowId: 'wf-simple',
        runId: 'run-001',
        stepId: 'step-1',
        // jobId and attempt are optional
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'workflow',
        workflowId: 'wf-simple',
        runId: 'run-001',
        jobId: undefined,
        stepId: 'step-1',
        attempt: undefined,
      });
    });
  });

  describe('Webhook host context', () => {
    it('should extract webhook fields', () => {
      const context: WebhookHostContext = {
        host: 'webhook',
        event: 'pull_request.opened',
        source: 'github',
        payload: { action: 'opened', number: 123 },
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'webhook',
        event: 'pull_request.opened',
        source: 'github',
      });
    });

    it('should handle missing optional webhook fields', () => {
      const context: WebhookHostContext = {
        host: 'webhook',
        event: 'custom.event',
        // source is optional
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'webhook',
        event: 'custom.event',
        source: undefined,
      });
    });
  });

  describe('Cron host context', () => {
    it('should extract all cron fields', () => {
      const context: CronHostContext = {
        host: 'cron',
        cronId: 'daily-cleanup',
        schedule: '0 0 * * *',
        scheduledAt: '2025-01-04T00:00:00Z',
        lastRunAt: '2025-01-03T00:00:00Z',
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'cron',
        cronId: 'daily-cleanup',
        schedule: '0 0 * * *',
        scheduledAt: '2025-01-04T00:00:00Z',
        lastRunAt: '2025-01-03T00:00:00Z',
      });
    });

    it('should handle missing lastRunAt (first run)', () => {
      const context: CronHostContext = {
        host: 'cron',
        cronId: 'new-job',
        schedule: '*/5 * * * *',
        scheduledAt: '2025-01-04T12:00:00Z',
        // lastRunAt is optional (first run)
      };

      const meta = getLoggerMetadataFromHost(context);

      expect(meta).toEqual({
        layer: 'cron',
        cronId: 'new-job',
        schedule: '*/5 * * * *',
        scheduledAt: '2025-01-04T12:00:00Z',
        lastRunAt: undefined,
      });
    });
  });

  describe('Type safety', () => {
    it('should handle discriminated union correctly', () => {
      // This test verifies TypeScript correctly narrows the type
      const contexts = [
        { host: 'rest' as const, method: 'GET', path: '/', requestId: '1', traceId: '1' },
        { host: 'cli' as const, argv: [], flags: {} },
        { host: 'workflow' as const, workflowId: 'w', runId: 'r', stepId: 's' },
        { host: 'webhook' as const, event: 'test' },
        { host: 'cron' as const, cronId: 'c', schedule: '* * * * *', scheduledAt: '2025-01-01' },
      ];

      contexts.forEach((ctx) => {
        const meta = getLoggerMetadataFromHost(ctx as any);
        expect(meta).toHaveProperty('layer');
        expect(meta.layer).toBe(ctx.host);
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should provide context for REST API logging', () => {
      // Simulate real REST request
      const context: RestHostContext = {
        host: 'rest',
        method: 'POST',
        path: '/api/v1/commit/apply',
        requestId: 'req-prod-001',
        traceId: 'trace-user-session-123',
        tenantId: 'customer-xyz',
        headers: { authorization: 'Bearer token' },
        body: { scope: '@kb-labs/core' },
      };

      const meta = getLoggerMetadataFromHost(context);

      // Verify all correlation IDs are present
      expect(meta.reqId).toBe('req-prod-001');
      expect(meta.traceId).toBe('trace-user-session-123');
      expect(meta.tenantId).toBe('customer-xyz');

      // Verify request details
      expect(meta.method).toBe('POST');
      expect(meta.url).toBe('/api/v1/commit/apply');
    });

    it('should provide context for workflow step logging', () => {
      // Simulate workflow step execution
      const context: WorkflowHostContext = {
        host: 'workflow',
        workflowId: 'deploy-production',
        runId: 'run-2025-01-04-001',
        jobId: 'build-and-test',
        stepId: 'run-tests',
        attempt: 1,
      };

      const meta = getLoggerMetadataFromHost(context);

      // Verify workflow execution context
      expect(meta.workflowId).toBe('deploy-production');
      expect(meta.runId).toBe('run-2025-01-04-001');
      expect(meta.jobId).toBe('build-and-test');
      expect(meta.stepId).toBe('run-tests');
      expect(meta.attempt).toBe(1);
    });

    it('should provide context for webhook event logging', () => {
      // Simulate GitHub webhook
      const context: WebhookHostContext = {
        host: 'webhook',
        event: 'push',
        source: 'github',
        payload: {
          ref: 'refs/heads/main',
          commits: [{ message: 'fix: bug' }],
        },
      };

      const meta = getLoggerMetadataFromHost(context);

      // Verify webhook event details
      expect(meta.event).toBe('push');
      expect(meta.source).toBe('github');
    });
  });
});
