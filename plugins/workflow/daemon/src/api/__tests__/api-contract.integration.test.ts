import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCronAPI } from '../cron-api.js';
import { registerJobsAPI } from '../jobs-api.js';
import { registerWorkflowsAPI } from '../workflows-api.js';
import { registerApprovalsAPI } from '../approvals-api.js';

function createHostServiceMock() {
  return {
    submitJob: vi.fn(async () => ({ jobId: 'job-1' })),
    getJob: vi.fn(async () => ({ id: 'job-1', type: 'test', status: 'running' })),
    cancelJob: vi.fn(async () => ({ cancelled: true })),
    listJobs: vi.fn(async () => ({ jobs: [{ id: 'job-1', type: 'test', status: 'running' }] })),
    getJobSteps: vi.fn(async () => [{ id: 's1', status: 'success' }]),
    getJobLogs: vi.fn(async () => [{ message: 'log' }]),
    registerCron: vi.fn(() => ({ ok: true })),
    unregisterCron: vi.fn(() => ({ ok: true })),
    listCron: vi.fn(() => ({ crons: [{ id: 'c1', schedule: '* * * * *', jobType: 'test', enabled: true }] })),
    triggerCron: vi.fn(async () => ({ ok: true })),
    pauseCron: vi.fn(() => ({ ok: true })),
    resumeCron: vi.fn(() => ({ ok: true })),
    listWorkflows: vi.fn(async () => ({ workflows: [{ id: 'w1', name: 'wf', source: 'standalone' }] })),
    getWorkflow: vi.fn(async () => ({ id: 'w1', name: 'wf', source: 'standalone' })),
    runWorkflow: vi.fn(async () => ({ runId: 'r1', status: 'queued' })),
    listRuns: vi.fn(async () => ({ runs: [{ id: 'r1', status: 'running' }], total: 1 })),
    getRun: vi.fn(async () => ({ id: 'r1', status: 'running', jobs: [] })),
    cancelRun: vi.fn(async () => {}),
    listWorkflowRuns: vi.fn(async () => ({ runs: [], total: 0 })),
    getRunLogs: vi.fn(async () => [
      { timestamp: '2026-01-01T00:00:00.000Z', level: 'info', message: 'Executing step', context: { runId: 'r1' } },
    ]),
  };
}

function createEngineMock() {
  return {
    getRun: vi.fn(async () => ({
      id: 'r1',
      status: 'running',
      jobs: [{
        id: 'j1',
        steps: [{
          id: 's1',
          name: 'approve me',
          status: 'waiting_approval',
          startedAt: new Date().toISOString(),
          spec: { id: 'step-spec-1', with: {} },
        }],
      }],
    })),
    subscribeToRunEvents: vi.fn(() => () => {}),
    resolveApproval: vi.fn(async () => {}),
  };
}

describe('Workflow API Contract Integration', () => {
  let app: FastifyInstance;
  let hostService: ReturnType<typeof createHostServiceMock>;
  let engine: ReturnType<typeof createEngineMock>;
  let observability: { observeOperation: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    app = Fastify({ logger: false });
    hostService = createHostServiceMock();
    engine = createEngineMock();
    const logger = {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(),
    } as any;
    observability = {
      observeOperation: vi.fn((_name: string, fn: () => unknown) => fn()),
    };

    registerJobsAPI({ server: app, hostService: hostService as any, logger, observability: observability as any });
    registerCronAPI({ server: app, hostService: hostService as any, logger, observability: observability as any });
    registerWorkflowsAPI({ server: app, hostService: hostService as any, engine: engine as any, logger, observability: observability as any });
    registerApprovalsAPI({ server: app, engine: engine as any, logger, observability: observability as any });
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Jobs ─────────────────────────────────────────────────────────────

  describe('Jobs', () => {
    it('GET /api/v1/jobs — lists jobs with envelope', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/jobs' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        ok: true,
        data: { jobs: [{ id: 'job-1', type: 'test', status: 'running' }] },
      });
    });

    it('GET /api/v1/jobs/:jobId — returns job', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/jobs/job-1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ id: 'job-1', status: 'running' });
    });

    it('GET /api/v1/jobs/:jobId — 404 when not found', async () => {
      hostService.getJob.mockRejectedValueOnce(new Error('Job not found'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/jobs/missing' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ ok: false, error: 'Job not found' });
    });

    it('POST /api/v1/jobs/:jobId/cancel — cancels job', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/jobs/job-1/cancel' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ cancelled: true });
    });

    it('GET /api/v1/jobs/:jobId/steps — returns steps', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/jobs/job-1/steps' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual([{ id: 's1', status: 'success' }]);
    });

    it('GET /api/v1/jobs/:jobId/logs — returns logs', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/jobs/job-1/logs' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ logs: [{ message: 'log' }] });
    });

    it('GET /api/v1/jobs/:jobId/steps — 404 when job not found', async () => {
      hostService.getJobSteps.mockRejectedValueOnce(new Error('Job not found'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/jobs/missing/steps' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Crons ────────────────────────────────────────────────────────────

  describe('Crons', () => {
    it('GET /api/v1/crons — lists crons', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/crons' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        ok: true,
        data: { crons: [{ id: 'c1', schedule: '* * * * *', jobType: 'test', enabled: true }] },
      });
    });

    it('POST /api/v1/crons — registers cron', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/crons',
        payload: { id: 'c2', schedule: '0 * * * *', jobType: 'test' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it('DELETE /api/v1/crons/:id — unregisters cron', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/crons/c1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it('POST /api/v1/crons/:id/trigger — triggers cron', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/crons/c1/trigger' });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it('POST /api/v1/crons/:id/pause — pauses cron', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/crons/c1/pause' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, data: { ok: true } });
    });

    it('POST /api/v1/crons/:id/resume — resumes cron', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/crons/c1/resume' });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    });

    it('old /api/v1/cron path returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/cron' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── Workflows ────────────────────────────────────────────────────────

  describe('Workflows', () => {
    it('GET /api/v1/workflows — lists workflows', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workflows' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ workflows: [{ id: 'w1' }] });
    });

    it('GET /api/v1/workflows/:id — returns definition', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workflows/w1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ id: 'w1', name: 'wf' });
    });

    it('GET /api/v1/workflows/:id — 404 when not found', async () => {
      hostService.getWorkflow.mockResolvedValueOnce(null as any);
      const res = await app.inject({ method: 'GET', url: '/api/v1/workflows/missing' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ ok: false, error: 'Workflow not found' });
    });

    it('GET /api/v1/workflows/:id/runs — lists runs for workflow', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/workflows/w1/runs' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ runs: [], total: 0 });
    });

    it('POST /api/v1/workflows/:id/runs — starts a run', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/workflows/w1/runs',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ runId: 'r1', status: 'queued' });
    });

    it('POST /api/v1/workflows/:id/runs — 404 when workflow not found', async () => {
      hostService.runWorkflow.mockRejectedValueOnce(new Error('Workflow not found'));
      const res = await app.inject({
        method: 'POST', url: '/api/v1/workflows/missing/runs',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('old POST /api/v1/workflows/:id/run path returns 404', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/workflows/w1/run', payload: {} });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/v1/workflows/refresh — refreshes definitions', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/workflows/refresh' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Runs ─────────────────────────────────────────────────────────────

  describe('Runs', () => {
    it('GET /api/v1/runs — lists all runs', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ runs: [{ id: 'r1' }], total: 1 });
    });

    it('GET /api/v1/runs/:runId — returns run', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/r1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ run: { id: 'r1' } });
    });

    it('GET /api/v1/runs/:runId — 404 when not found', async () => {
      hostService.getRun.mockResolvedValueOnce(null as any);
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/missing' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ ok: false, error: 'Run not found' });
    });

    it('POST /api/v1/runs/:runId/cancel — cancels run', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/runs/r1/cancel' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ cancelled: true, runId: 'r1' });
    });

    it('POST /api/v1/runs/:runId/cancel — 404 when not found', async () => {
      hostService.cancelRun.mockRejectedValueOnce(new Error('Run not found'));
      const res = await app.inject({ method: 'POST', url: '/api/v1/runs/missing/cancel' });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/v1/runs/:runId/cancel — 409 when already terminal', async () => {
      hostService.cancelRun.mockRejectedValueOnce(new Error('Cannot cancel run in status: success'));
      const res = await app.inject({ method: 'POST', url: '/api/v1/runs/r1/cancel' });
      expect(res.statusCode).toBe(409);
    });

    it('old /workflows/runs/:runId/cancel path returns 404', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/workflows/runs/r1/cancel' });
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/v1/runs/:runId/logs — returns run logs with envelope', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/r1/logs' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.data.runId).toBe('r1');
      expect(body.data.logs).toHaveLength(1);
      expect(body.data.logs[0]).toMatchObject({ level: 'info', message: 'Executing step' });
      expect(hostService.getRunLogs).toHaveBeenCalledWith('r1', {
        stepId: undefined,
        level: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('GET /api/v1/runs/:runId/logs?stepId= — passes stepId to service', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/runs/r1/logs?stepId=r1%3Ajob%3A0&level=info&limit=20&offset=0',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.stepId).toBe('r1:job:0');
      expect(hostService.getRunLogs).toHaveBeenCalledWith('r1', {
        stepId: 'r1:job:0',
        level: 'info',
        limit: 20,
        offset: 0,
      });
    });

    it('GET /api/v1/runs/:runId/logs — 500 on service error', async () => {
      hostService.getRunLogs.mockRejectedValueOnce(new Error('storage unavailable'));
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/r1/logs' });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ ok: false, error: 'storage unavailable' });
    });
  });

  // ── Approvals ────────────────────────────────────────────────────────

  describe('Approvals', () => {
    it('GET /api/v1/runs/:runId/approvals — lists pending approvals', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/r1/approvals' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(true);
      expect(body.data.runId).toBe('r1');
      expect(body.data.pending).toHaveLength(1);
      expect(body.data.pending[0]).toMatchObject({ stepId: 's1', stepName: 'approve me' });
    });

    it('GET /api/v1/runs/:runId/approvals — 404 when run not found', async () => {
      engine.getRun.mockResolvedValueOnce(null as any);
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/missing/approvals' });
      expect(res.statusCode).toBe(404);
    });

    it('GET /api/v1/runs/:runId/approvals — empty list when no pending steps', async () => {
      engine.getRun.mockResolvedValueOnce({ id: 'r1', status: 'running', jobs: [{ id: 'j1', steps: [{ id: 's1', status: 'running', spec: {} }] }] } as any);
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/r1/approvals' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.pending).toHaveLength(0);
    });

    it('POST /api/v1/runs/:runId/approvals/resolve — approves step', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/runs/r1/approvals/resolve',
        payload: { jobId: 'j1', stepId: 's1', action: 'approve' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ action: 'approve', resolved: true });
      expect(engine.resolveApproval).toHaveBeenCalledWith('r1', 'j1', 's1', 'approve', undefined, undefined);
    });

    it('POST /api/v1/runs/:runId/approvals/resolve — rejects step', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/runs/r1/approvals/resolve',
        payload: { jobId: 'j1', stepId: 's1', action: 'reject', comment: 'not good' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toMatchObject({ action: 'reject', resolved: true });
      expect(engine.resolveApproval).toHaveBeenCalledWith('r1', 'j1', 's1', 'reject', undefined, 'not good');
    });

    it('POST /api/v1/runs/:runId/approvals/resolve — 400 on missing fields', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/runs/r1/approvals/resolve',
        payload: { jobId: 'j1' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/v1/runs/:runId/approvals/resolve — 400 on invalid action', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/runs/r1/approvals/resolve',
        payload: { jobId: 'j1', stepId: 's1', action: 'maybe' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/v1/runs/:runId/approvals/resolve — 404 when run not found', async () => {
      engine.getRun.mockResolvedValueOnce(null as any);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/runs/missing/approvals/resolve',
        payload: { jobId: 'j1', stepId: 's1', action: 'approve' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('POST /api/v1/runs/:runId/approvals/resolve — 409 when step not waiting', async () => {
      engine.getRun.mockResolvedValueOnce({
        id: 'r1', status: 'running',
        jobs: [{ id: 'j1', steps: [{ id: 's1', name: 'x', status: 'success', spec: {} }] }],
      } as any);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/runs/r1/approvals/resolve',
        payload: { jobId: 'j1', stepId: 's1', action: 'approve' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('old /runs/:runId/pending-approvals path returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/runs/r1/pending-approvals' });
      expect(res.statusCode).toBe(404);
    });

    it('old /runs/:runId/approve path returns 404', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/runs/r1/approve', payload: {} });
      expect(res.statusCode).toBe(404);
    });
  });
});
