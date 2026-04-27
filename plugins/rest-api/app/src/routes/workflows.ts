/**
 * @module @kb-labs/rest-api-app/routes/workflows
 * Workflow SSE streaming endpoint.
 *
 * All CRUD operations (list runs, get run, cancel, run workflow) are handled
 * by the workflow plugin via plugin routes (/plugins/workflow/...).
 * This file only provides the SSE event stream which requires a long-lived
 * connection that cannot go through the plugin execution backend.
 */

import type { FastifyInstance } from 'fastify'
import type { RestApiConfig } from '@kb-labs/rest-api-core'
import { WORKFLOW_REDIS_CHANNEL } from '@kb-labs/workflow-constants'
import { platform } from '@kb-labs/core-runtime'
import { normalizeBasePath } from '../utils/path-helpers'

interface HttpError extends Error {
  statusCode: number;
  code: string;
}

const TERMINAL_EVENT_TYPES = ['run.finished', 'run.failed', 'run.cancelled']
const KEEP_ALIVE_MS = 30_000
const IDLE_TIMEOUT_MS = 60_000
const EVENT_BUS_KEY = `eventbus:${WORKFLOW_REDIS_CHANNEL}`

/**
 * Replay past events for a runId from the Redis sorted set.
 * Returns true if a terminal event was found (run already finished).
 */
async function replayHistory(
  runId: string,
  sendEvent: (type: string, payload: unknown, timestamp?: string) => void,
): Promise<boolean> {
  let hasTerminal = false
  try {
    const cache = platform.cache
    if (!cache?.zrangebyscore) {return false}

    const stored = await cache.zrangebyscore(EVENT_BUS_KEY, 0, Date.now())
    for (const raw of stored) {
      try {
        const wrapper = JSON.parse(raw) as { data: { type: string; runId: string; payload?: unknown; timestamp?: string } }
        const event = wrapper.data
        if (event.runId !== runId) {continue}
        sendEvent(event.type, event.payload, event.timestamp)
        if (TERMINAL_EVENT_TYPES.includes(event.type)) {
          hasTerminal = true
        }
      } catch { /* skip malformed entries */ }
    }
  } catch { /* cache unavailable — skip replay */ }
  return hasTerminal
}

export async function registerWorkflowRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath)

  // SSE stream of workflow run events via shared IEventBus.
  // No local engine needed — events arrive through the distributed event bus
  // (state broker / Redis / Kafka). The daemon publishes, we subscribe.
  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId/events`,
    handler: async (request, reply) => {
      const runId = getRunId(request.params)

      // SSE response — hijack from Fastify
      reply.hijack()
      const raw = reply.raw

      const origin = request.headers.origin
      if (typeof origin === 'string' && (origin === 'http://localhost:3000' || origin === 'http://localhost:5173')) {
        raw.setHeader('Access-Control-Allow-Origin', origin)
        raw.setHeader('Access-Control-Allow-Credentials', 'true')
      }
      raw.setHeader('Content-Type', 'text/event-stream')
      raw.setHeader('Cache-Control', 'no-cache, no-transform')
      raw.setHeader('Connection', 'keep-alive')
      raw.flushHeaders?.()
      raw.write(': connected\n\n')

      const sentIds = new Set<string>()

      const sendEvent = (type: string, payload: unknown, timestamp?: string) => {
        if (raw.writableEnded) {return}
        const data = { type, runId, payload, timestamp: timestamp ?? new Date().toISOString() }
        // Dedup by type+timestamp to avoid replaying events that also arrive live
        const dedup = `${type}:${data.timestamp}`
        if (sentIds.has(dedup)) {return}
        sentIds.add(dedup)
        raw.write(`event: workflow.event\n`)
        raw.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      // Replay history — send past events for this run
      const alreadyFinished = await replayHistory(runId, sendEvent)
      if (alreadyFinished) {
        raw.end()
        return
      }

      let idleTimer: ReturnType<typeof setTimeout> | null = null

      const resetIdle = () => {
        if (idleTimer) {clearTimeout(idleTimer)}
        idleTimer = setTimeout(() => {
          cleanup()
        }, IDLE_TIMEOUT_MS)
      }

      const keepAliveTimer = setInterval(() => {
        if (raw.writableEnded) {return}
        raw.write(': keep-alive\n\n')
      }, KEEP_ALIVE_MS)

      const unsubscribe = platform.eventBus.subscribe(WORKFLOW_REDIS_CHANNEL, async (rawEvent: unknown) => {
        const event = rawEvent as { type: string; runId: string; payload?: unknown; timestamp?: string }
        if (event.runId !== runId) {return}
        sendEvent(event.type, event.payload, event.timestamp)
        resetIdle()
        if (TERMINAL_EVENT_TYPES.includes(event.type)) {
          cleanup()
        }
      })

      const cleanup = () => {
        unsubscribe()
        if (idleTimer) {clearTimeout(idleTimer)}
        clearInterval(keepAliveTimer)
        if (!raw.writableEnded) {
          raw.write(`event: workflow.done\ndata: {}\n\n`)
          raw.end()
        }
      }

      resetIdle()
      request.raw.on('close', cleanup)
    },
  })

  // SSE stream of workflow run logs via shared IEventBus.
  // Sends all events for a run as `workflow.log` entries with jobId/stepId context.
  server.route({
    method: 'GET',
    url: `${basePath}/workflows/runs/:runId/logs`,
    handler: async (request, reply) => {
      const runId = getRunId(request.params)
      const query = request.query as { idleTimeoutMs?: string }
      const idleTimeout = query.idleTimeoutMs ? parseInt(query.idleTimeoutMs, 10) : IDLE_TIMEOUT_MS

      reply.hijack()
      const raw = reply.raw

      const origin = request.headers.origin
      if (typeof origin === 'string' && (origin === 'http://localhost:3000' || origin === 'http://localhost:5173')) {
        raw.setHeader('Access-Control-Allow-Origin', origin)
        raw.setHeader('Access-Control-Allow-Credentials', 'true')
      }
      raw.setHeader('Content-Type', 'text/event-stream')
      raw.setHeader('Cache-Control', 'no-cache, no-transform')
      raw.setHeader('Connection', 'keep-alive')
      raw.flushHeaders?.()
      raw.write(': connected\n\n')

      const sentLogIds = new Set<string>()

      const sendLog = (event: { type: string; runId: string; jobId?: string; stepId?: string; payload?: unknown; timestamp?: string }) => {
        if (raw.writableEnded) {return}
        const ts = event.timestamp ?? new Date().toISOString()
        const dedup = `${event.type}:${event.jobId ?? ''}:${event.stepId ?? ''}:${ts}`
        if (sentLogIds.has(dedup)) {return}
        sentLogIds.add(dedup)
        raw.write(`event: workflow.log\n`)
        raw.write(`data: ${JSON.stringify({
          type: event.type,
          runId: event.runId,
          jobId: event.jobId,
          stepId: event.stepId,
          payload: event.payload,
          timestamp: ts,
        })}\n\n`)
      }

      // Replay history for logs
      let logsAlreadyFinished = false
      try {
        const cache = platform.cache
        if (cache?.zrangebyscore) {
          const stored = await cache.zrangebyscore(EVENT_BUS_KEY, 0, Date.now())
          for (const rawStr of stored) {
            try {
              const wrapper = JSON.parse(rawStr) as { data: { type: string; runId: string; jobId?: string; stepId?: string; payload?: unknown; timestamp?: string } }
              const ev = wrapper.data
              if (ev.runId !== runId) {continue}
              sendLog(ev)
              if (TERMINAL_EVENT_TYPES.includes(ev.type)) {logsAlreadyFinished = true}
            } catch { /* skip */ }
          }
        }
      } catch { /* cache unavailable */ }

      if (logsAlreadyFinished) {
        raw.write(`event: workflow.done\ndata: {}\n\n`)
        raw.end()
        return
      }

      let idleTimer: ReturnType<typeof setTimeout> | null = null

      const resetIdle = () => {
        if (idleTimer) {clearTimeout(idleTimer)}
        idleTimer = setTimeout(() => {
          cleanup()
        }, idleTimeout)
      }

      const keepAliveTimer = setInterval(() => {
        if (raw.writableEnded) {return}
        raw.write(': keep-alive\n\n')
      }, KEEP_ALIVE_MS)

      const unsubscribe = platform.eventBus.subscribe(WORKFLOW_REDIS_CHANNEL, async (rawEvent: unknown) => {
        const event = rawEvent as { type: string; runId: string; jobId?: string; stepId?: string; payload?: unknown; timestamp?: string }
        if (event.runId !== runId) {return}
        sendLog(event)
        resetIdle()
        if (TERMINAL_EVENT_TYPES.includes(event.type)) {
          cleanup()
        }
      })

      const cleanup = () => {
        unsubscribe()
        if (idleTimer) {clearTimeout(idleTimer)}
        clearInterval(keepAliveTimer)
        if (!raw.writableEnded) {
          raw.write(`event: workflow.done\ndata: {}\n\n`)
          raw.end()
        }
      }

      resetIdle()
      request.raw.on('close', cleanup)
    },
  })
}

function getRunId(params: unknown): string {
  const runId = (params as { runId?: unknown } | undefined)?.runId
  if (!runId || typeof runId !== 'string') {
    const error = new Error('runId must be provided') as HttpError
    error.statusCode = 400
    error.code = 'WF_RUN_ID_REQUIRED'
    throw error
  }
  return runId
}
