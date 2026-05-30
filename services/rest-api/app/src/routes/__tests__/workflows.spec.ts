import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import type { RestApiConfig } from '@kb-labs/rest-api-core'
import { registerWorkflowRoutes } from '../workflows'

const BASE_CONFIG: RestApiConfig = {
  port: 3000,
  basePath: '/api/v1',
  apiVersion: 'test',
  cors: {
    origins: [],
    allowCredentials: true,
    profile: 'dev',
  },
  plugins: [],
  mockMode: false,
}

type EventHandler = (event: unknown) => Promise<void>
let capturedHandlers: EventHandler[] = []

const { mockUnsubscribe, mockSubscribe } = vi.hoisted(() => {
  const mockUnsubscribe = vi.fn()
  const mockSubscribe = vi.fn((_channel: string, handler: EventHandler) => {
    capturedHandlers.push(handler)
    // Immediately emit a terminal event to close the SSE stream,
    // so app.inject() resolves instead of hanging.
    setTimeout(() => {
      handler({ type: 'run.finished', runId: 'run-123', payload: { status: 'success' } })
    }, 10)
    return mockUnsubscribe
  })
  return { mockUnsubscribe, mockSubscribe }
})

vi.mock('@kb-labs/core-runtime', () => ({
  platform: {
    eventBus: {
      subscribe: mockSubscribe,
    },
  },
}))

vi.mock('@kb-labs/workflow-constants', () => ({
  WORKFLOW_REDIS_CHANNEL: 'kb:wf:events',
}))

describe('registerWorkflowRoutes', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.clearAllMocks()
    capturedHandlers = []
    app = Fastify({ logger: false })
    await registerWorkflowRoutes(app, BASE_CONFIG)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /workflows/runs/:runId/events (SSE)', () => {
    it('returns SSE headers and connected comment', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/events',
      })

      expect(response.headers['content-type']).toBe('text/event-stream')
      expect(response.headers['cache-control']).toBe('no-cache, no-transform')
      expect(response.headers['connection']).toBe('keep-alive')
      expect(response.body).toContain(': connected')
    })

    it('emits workflow.event for matching runId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/events',
      })

      expect(response.body).toContain('event: workflow.event')
      expect(response.body).toContain('"type":"run.finished"')
      expect(response.body).toContain('"runId":"run-123"')
    })

    it('sets CORS headers for localhost:3000', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/events',
        headers: { origin: 'http://localhost:3000' },
      })

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    it('sets CORS headers for localhost:5173', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/events',
        headers: { origin: 'http://localhost:5173' },
      })

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    })

    it('does not set CORS headers for other origins', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/events',
        headers: { origin: 'http://evil.com' },
      })

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('calls unsubscribe on terminal event', async () => {
      await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/events',
      })

      expect(mockUnsubscribe).toHaveBeenCalled()
    })

    it('filters events by runId — ignores other runs', async () => {
      // Override the mock to emit an event for a different runId first
      mockSubscribe.mockImplementationOnce((_channel, handler: EventHandler) => {
        setTimeout(async () => {
          // Event for a different run — should be ignored
          await handler({ type: 'step.started', runId: 'other-run', payload: {} })
          // Terminal event for our run — closes the stream
          await handler({ type: 'run.finished', runId: 'run-123', payload: {} })
        }, 10)
        return mockUnsubscribe
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/events',
      })

      // Should NOT contain the other-run event
      expect(response.body).not.toContain('other-run')
      expect(response.body).toContain('"runId":"run-123"')
    })
  })

  describe('GET /workflows/runs/:runId/logs (SSE)', () => {
    it('returns SSE headers and connected comment', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/logs?follow=1',
      })

      expect(response.headers['content-type']).toBe('text/event-stream')
      expect(response.headers['cache-control']).toBe('no-cache, no-transform')
      expect(response.headers['connection']).toBe('keep-alive')
      expect(response.body).toContain(': connected')
    })

    it('emits workflow.log events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/logs',
      })

      expect(response.body).toContain('event: workflow.log')
      expect(response.body).toContain('"type":"run.finished"')
      expect(response.body).toContain('"runId":"run-123"')
    })

    it('sets CORS headers for localhost:3000', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/logs',
        headers: { origin: 'http://localhost:3000' },
      })

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000')
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    it('does not set CORS headers for unknown origins', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/logs',
        headers: { origin: 'http://attacker.com' },
      })

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })

    it('respects custom idleTimeoutMs query param', async () => {
      // Just verify the route accepts the param without error
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/workflows/runs/run-123/logs?idleTimeoutMs=5000',
      })

      expect(response.headers['content-type']).toBe('text/event-stream')
    })
  })
})
