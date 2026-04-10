/**
 * Tests for JobsAPI adapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJobsAPI, createNoopJobsAPI } from '../api/jobs.js';
import type { IJobScheduler, JobHandle } from '@kb-labs/core-platform';

describe('JobsAPI', () => {
  describe.skip('createJobsAPI', () => {
    let mockScheduler: IJobScheduler;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockScheduler = {
        submit: vi.fn(),
        schedule: vi.fn(),
        cancel: vi.fn(),
        getStatus: vi.fn(),
        list: vi.fn(),
      };

      // Mock global fetch
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    it('should submit job and return job ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'job-123' }),
      } as Response);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',

        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const jobId = await api.submit({
        type: 'send-email',
        payload: { to: 'test@example.com' },
      });

      expect(jobId).toBe('job-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/jobs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Tenant-ID': 'test-tenant',
          }),
        })
      );
    });

    it('should pass job options to scheduler.submit', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'send-email',
        tenantId: 'test-tenant',
        status: 'pending',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.submit).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      await api.submit({
        type: 'send-email',
        payload: {},
        priority: 80,
        maxRetries: 5,
        timeout: 30000,
        idempotencyKey: 'idem-123',
      });

      expect(mockScheduler.submit).toHaveBeenCalledWith({
        type: 'send-email',
        payload: {},
        tenantId: 'test-tenant',
        priority: 80,
        maxRetries: 5,
        timeout: 30000,
        runAt: undefined,
        idempotencyKey: 'idem-123',
      });
    });

    it('should schedule job with cron expression', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'cleanup',
        tenantId: 'test-tenant',
        status: 'pending',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.schedule).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const jobId = await api.schedule(
        {
          type: 'cleanup',
          payload: {},
        },
        '0 0 * * *' // Daily at midnight
      );

      expect(jobId).toBe('job-123');
      expect(mockScheduler.schedule).toHaveBeenCalledWith(
        {
          type: 'cleanup',
          payload: {},
          tenantId: 'test-tenant',
          priority: undefined,
          maxRetries: undefined,
          timeout: undefined,
          idempotencyKey: undefined,
        },
        '0 0 * * *'
      );
    });

    it('should schedule job with specific date', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'reminder',
        tenantId: 'test-tenant',
        status: 'pending',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.schedule).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const scheduleDate = new Date('2025-12-31T23:59:59Z');
      const jobId = await api.schedule(
        {
          type: 'reminder',
          payload: { message: 'Happy New Year!' },
        },
        scheduleDate
      );

      expect(jobId).toBe('job-123');
      expect(mockScheduler.schedule).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'reminder',
          payload: { message: 'Happy New Year!' },
          tenantId: 'test-tenant',
        }),
        scheduleDate
      );
    });

    it('should wait for job completion', async () => {
      const completedHandle: JobHandle = {
        id: 'job-123',
        type: 'process-file',
        tenantId: 'test-tenant',
        status: 'completed',
        result: { processed: true },
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      };

      vi.mocked(mockScheduler.getStatus).mockResolvedValue(completedHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const result = await api.wait('job-123', { timeout: 1000, pollInterval: 100 });

      expect(result).toEqual({ processed: true });
    });

    it('should throw if job fails during wait', async () => {
      const failedHandle: JobHandle = {
        id: 'job-123',
        type: 'process-file',
        tenantId: 'test-tenant',
        status: 'failed',
        error: 'File not found',
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      };

      vi.mocked(mockScheduler.getStatus).mockResolvedValue(failedHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      await expect(
        api.wait('job-123', { timeout: 1000, pollInterval: 100 })
      ).rejects.toThrow('Job failed: File not found');
    });

    it('should throw if job is cancelled during wait', async () => {
      const cancelledHandle: JobHandle = {
        id: 'job-123',
        type: 'process-file',
        tenantId: 'test-tenant',
        status: 'cancelled',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.getStatus).mockResolvedValue(cancelledHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      await expect(
        api.wait('job-123', { timeout: 1000, pollInterval: 100 })
      ).rejects.toThrow('Job cancelled');
    });

    it('should throw if job not found during wait', async () => {
      vi.mocked(mockScheduler.getStatus).mockResolvedValue(null);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      await expect(
        api.wait('job-123', { timeout: 1000, pollInterval: 100 })
      ).rejects.toThrow('Job not found: job-123');
    });

    it('should get job status', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'send-email',
        tenantId: 'test-tenant',
        status: 'running',
        progress: 50,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        startedAt: new Date('2025-01-01T00:00:01Z'),
      };

      vi.mocked(mockScheduler.getStatus).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const status = await api.status('job-123');

      expect(status).toEqual({
        id: 'job-123',
        type: 'send-email',
        status: 'running',
        progress: 50,
        result: undefined,
        error: undefined,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        startedAt: new Date('2025-01-01T00:00:01Z'),
        completedAt: undefined,
      });
    });

    it('should return null if job not found', async () => {
      vi.mocked(mockScheduler.getStatus).mockResolvedValue(null);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const status = await api.status('job-123');

      expect(status).toBeNull();
    });

    it('should cancel job', async () => {
      vi.mocked(mockScheduler.cancel).mockResolvedValue(true);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const cancelled = await api.cancel('job-123');

      expect(cancelled).toBe(true);
      expect(mockScheduler.cancel).toHaveBeenCalledWith('job-123');
    });

    it('should return false if job not found on cancel', async () => {
      vi.mocked(mockScheduler.cancel).mockResolvedValue(false);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const cancelled = await api.cancel('job-123');

      expect(cancelled).toBe(false);
    });

    it('should list jobs with filters', async () => {
      const mockHandles: JobHandle[] = [
        {
          id: 'job-1',
          type: 'send-email',
          tenantId: 'test-tenant',
          status: 'completed',
          createdAt: new Date(),
        },
        {
          id: 'job-2',
          type: 'send-email',
          tenantId: 'test-tenant',
          status: 'running',
          createdAt: new Date(),
        },
      ];

      vi.mocked(mockScheduler.list).mockResolvedValue(mockHandles);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: true,
          },
        },
      });

      const jobs = await api.list({
        type: 'send-email',
        status: 'running',
        limit: 10,
      });

      expect(jobs).toHaveLength(2);
      expect(mockScheduler.list).toHaveBeenCalledWith({
        type: 'send-email',
        tenantId: 'test-tenant',
        status: 'running',
        limit: 10,
        offset: undefined,
      });
    });

    it('should allow jobs matching types scope', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'send-email',
        tenantId: 'test-tenant',
        status: 'pending',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.submit).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: {
              submit: true,
              types: ['send-*', 'cleanup-*'],
            },
          },
        },
      });

      // Should allow send-email (matches send-*)
      const jobId = await api.submit({ type: 'send-email', payload: {} });
      expect(jobId).toBe('job-123');

      // Should allow cleanup-logs (matches cleanup-*)
      await api.submit({ type: 'cleanup-logs', payload: {} });
      expect(mockScheduler.submit).toHaveBeenCalledTimes(2);
    });

    it('should deny jobs not matching types scope', async () => {
      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: {
              submit: true,
              types: ['send-*'],
            },
          },
        },
      });

      // Should deny process-payment (doesn't match send-*)
      await expect(api.submit({ type: 'process-payment', payload: {} })).rejects.toThrow(
        "Job type 'process-payment' access denied: not in allowed types scope"
      );
    });

    it('should allow all job types with wildcard scope', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'any-job',
        tenantId: 'test-tenant',
        status: 'pending',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.submit).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: {
              submit: true,
              types: ['*'],
            },
          },
        },
      });

      // Should allow any job type
      await api.submit({ type: 'any-job', payload: {} });
      await api.submit({ type: 'completely-different', payload: {} });
      expect(mockScheduler.submit).toHaveBeenCalledTimes(2);
    });

    it('should allow jobs when types is not specified', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'any-job',
        tenantId: 'test-tenant',
        status: 'pending',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.submit).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: {
              submit: true,
              // No types specified = all allowed
            },
          },
        },
      });

      // Should allow any job type when types is not specified
      await api.submit({ type: 'any-job', payload: {} });
      expect(mockScheduler.submit).toHaveBeenCalledTimes(1);
    });

    it('should check types scope for schedule operation', async () => {
      const mockHandle: JobHandle = {
        id: 'job-123',
        type: 'send-email',
        tenantId: 'test-tenant',
        status: 'pending',
        createdAt: new Date(),
      };

      vi.mocked(mockScheduler.schedule).mockResolvedValue(mockHandle);

      const api = createJobsAPI({
        workflowServiceUrl: "http://localhost:3000",
        tenantId: 'test-tenant',
        
        permissions: {
          platform: {
            jobs: {
              schedule: true,
              types: ['send-*'],
            },
          },
        },
      });

      // Should allow send-email
      await api.schedule({ type: 'send-email', payload: {} }, '0 * * * *');
      expect(mockScheduler.schedule).toHaveBeenCalledTimes(1);

      // Should deny process-payment
      await expect(
        api.schedule({ type: 'process-payment', payload: {} }, '0 * * * *')
      ).rejects.toThrow("Job type 'process-payment' access denied: not in allowed types scope");
    });
  });

  describe('createNoopJobsAPI', () => {
    it('should throw on submit/schedule/wait operations', () => {
      const api = createNoopJobsAPI();

      expect(() => api.submit({ type: 'test', payload: {} })).toThrow(
        /Job scheduler not available/
      );
      expect(() => api.schedule({ type: 'test', payload: {} }, '0 * * * *')).toThrow(
        /Job scheduler not available/
      );
      expect(() => api.wait('job-123')).toThrow(/Job scheduler not available/);
    });

    it('should return null/false for status/cancel operations', async () => {
      const api = createNoopJobsAPI();

      const status = await api.status('job-123');
      expect(status).toBeNull();

      const cancelled = await api.cancel('job-123');
      expect(cancelled).toBe(false);
    });

    it('should return empty array for list', async () => {
      const api = createNoopJobsAPI();

      const jobs = await api.list();
      expect(jobs).toEqual([]);
    });
  });
});
