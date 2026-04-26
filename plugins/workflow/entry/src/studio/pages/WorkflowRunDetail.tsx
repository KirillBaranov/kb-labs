/**
 * @module @kb-labs/studio-app/modules/workflows/pages/workflow-run-page
 * Workflow run detail page with live SSE logs, jobs/steps accordion, and approval modal
 */

import { UIPage, UIPageHeader, UIPageSection } from '@kb-labs/sdk/studio'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  UIButton, UITypographyText,
  UITitle, UIAlert, UIList, UIListItem, UIAccordion, UITabs, UIJsonViewer,
} from '@kb-labs/sdk/studio'
import type { UIAccordionItem, UITabItem } from '@kb-labs/sdk/studio'
import { useData, useMutateData, useSSE } from '@kb-labs/sdk/studio'
import type { WorkflowRun, StepRun } from '@kb-labs/workflow-contracts'
import type { WorkflowLogEvent } from '@kb-labs/workflow-contracts/rest-api'
import { WorkflowStatusBadge } from '../components/shared/WorkflowStatusBadge'
import { ApprovalModal } from '../components/ApprovalModal'
import { PipelineView } from '../components/pipeline/PipelineView'
import { DashboardView } from '../components/dashboard/DashboardView'
import { ViewModeSelector } from '../components/shared/ViewModeSelector'

const Text = UITypographyText
const Title = UITitle

// --- GitHub Actions style execution log ---

const STATUS_ICON: Record<string, string> = {
  'queued': '\u25CB',
  'running': '\u25C9',
  'success': '\u2713',
  'failed': '\u2717',
  'cancelled': '\u2298',
  'skipped': '\u2014',
  'waiting_approval': '\u23F8',
}

const STATUS_COLOR: Record<string, string> = {
  'queued': '#8b949e',
  'running': '#d29922',
  'success': '#3fb950',
  'failed': '#f85149',
  'cancelled': '#8b949e',
  'skipped': '#8b949e',
  'waiting_approval': '#d29922',
}

function eventTypeToStatus(type: string): string {
  if (type.endsWith('.started')) {return 'running'}
  if (type.endsWith('.succeeded') || type.endsWith('.finished')) {return 'success'}
  if (type.endsWith('.failed')) {return 'failed'}
  if (type.endsWith('.cancelled')) {return 'cancelled'}
  if (type.endsWith('.skipped')) {return 'skipped'}
  if (type.endsWith('.waitingApproval')) {return 'waiting_approval'}
  if (type.endsWith('.queued')) {return 'queued'}
  return 'running'
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) {return `${ms}ms`}
  const s = ms / 1000
  if (s < 60) {return `${s.toFixed(1)}s`}
  const m = Math.floor(s / 60)
  const rem = Math.floor(s % 60)
  return `${m}m ${rem}s`
}

function formatTime(ts?: string): string {
  if (!ts) {return ''}
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return '' }
}

interface LogLine {
  time: string
  text: string
  stream?: 'stdout' | 'stderr'
}

// Strip ANSI escape codes from text
 
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?\x07/g
function stripAnsi(s: string): string { return s.replace(ANSI_RE, '') }

function extractLogLines(ev: WorkflowLogEvent): LogLine[] {
  const time = formatTime(ev.timestamp)
  const payload = ev.payload as Record<string, unknown> | undefined
  if (!payload) {return []}

  // Live log.appended events (real-time streaming)
  if (ev.type === 'log.appended') {
    const msg = typeof payload.message === 'string' ? stripAnsi(payload.message) : ''
    if (!msg) {return []}
    const stream = (payload.stream as 'stdout' | 'stderr') ?? 'stdout'
    return [{ time, text: msg, stream }]
  }

  if (payload.outputs && typeof payload.outputs === 'object') {
    const outputs = payload.outputs as Record<string, unknown>
    if (typeof outputs.stdout === 'string' && outputs.stdout.trim()) {
      return stripAnsi(outputs.stdout).trim().split('\n').map(line => ({ time, text: line, stream: 'stdout' as const }))
    }
  }
  if (typeof payload.stdout === 'string' && payload.stdout.trim()) {
    return stripAnsi(payload.stdout).trim().split('\n').map(line => ({ time, text: line, stream: 'stdout' as const }))
  }
  if (typeof payload.error === 'string') {
    return [{ time, text: payload.error, stream: 'stderr' }]
  }
  if (typeof payload.message === 'string') {
    return [{ time, text: payload.message }]
  }
  if (typeof payload.line === 'string') {
    return [{ time, text: payload.line }]
  }
  if (typeof payload.text === 'string') {
    return [{ time, text: payload.text }]
  }
  const keys = Object.keys(payload).filter(k => !['status', 'jobName', 'durationMs', 'attempt'].includes(k))
  if (keys.length === 0) {return []}
  return [{ time, text: JSON.stringify(payload, null, 2) }]
}

interface StepLogGroup {
  stepId: string
  stepName: string
  status: string
  command?: string
  events: WorkflowLogEvent[]
  outputs?: Record<string, unknown>
  error?: Record<string, unknown> | null
  spec?: { name: string; uses?: string; with?: Record<string, unknown> }
  startedAt?: string
  finishedAt?: string
  durationMs?: number
}

interface JobLogGroup {
  jobId: string
  jobName: string
  status: string
  steps: StepLogGroup[]
  events: WorkflowLogEvent[]
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  error?: Record<string, unknown> | null
}

function buildLogGroups(events: WorkflowLogEvent[], run: WorkflowRun): JobLogGroup[] {
  const jobMap = new Map<string, JobLogGroup>()

  for (const job of run.jobs) {
    const stepGroups: StepLogGroup[] = job.steps.map(s => ({
      stepId: s.id,
      stepName: s.name,
      status: s.status,
      command: (s as StepRun & { command?: string }).command,
      events: [],
      outputs: s.outputs ?? undefined,
      error: s.error,
      spec: s.spec,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      durationMs: s.durationMs,
    }))
    jobMap.set(job.id, {
      jobId: job.id,
      jobName: job.jobName,
      status: job.status,
      steps: stepGroups,
      events: [],
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      error: job.error,
    })
  }

  for (const ev of events) {
    if (!ev.jobId) {continue}
    let group = jobMap.get(ev.jobId)
    if (!group) {
      group = {
        jobId: ev.jobId,
        jobName: ev.jobId,
        status: eventTypeToStatus(ev.type),
        steps: [],
        events: [],
      }
      jobMap.set(ev.jobId, group)
    }

    if (ev.type.startsWith('job.')) {
      group.status = eventTypeToStatus(ev.type)
      if (ev.payload?.jobName) {group.jobName = String(ev.payload.jobName)}
      if (ev.payload?.durationMs) {group.durationMs = Number(ev.payload.durationMs)}
    }

    if (ev.stepId) {
      let step = group.steps.find(s => s.stepId === ev.stepId)
      if (!step) {
        step = { stepId: ev.stepId, stepName: ev.stepId, status: 'queued', events: [] }
        group.steps.push(step)
      }
      step.events.push(ev)
      if (ev.type.startsWith('step.')) {
        step.status = eventTypeToStatus(ev.type)
      }
    } else {
      group.events.push(ev)
    }
  }

  return Array.from(jobMap.values())
}

const LOG_OUTPUT_KEYS = new Set(['stdout', 'stderr', 'exitCode', 'ok'])

function StepPanel({ step, onApprove }: { step: StepLogGroup; onApprove?: () => void }) {
  const sseLines: LogLine[] = step.events.flatMap(extractLogLines)
  const logRef = useRef<HTMLPreElement>(null)

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    const el = logRef.current
    if (!el) {return}
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [sseLines.length])

  const pollingLines: LogLine[] = useMemo(() => {
    if (sseLines.length > 0) {return []}
    const lines: LogLine[] = []
    if (step.outputs) {
      const stdout = step.outputs.stdout
      const stderr = step.outputs.stderr
      if (typeof stdout === 'string' && stdout.trim()) {
        for (const line of stdout.trim().split('\n')) {
          lines.push({ time: '', text: line })
        }
      }
      if (typeof stderr === 'string' && stderr.trim()) {
        for (const line of stderr.trim().split('\n')) {
          lines.push({ time: '', text: line })
        }
      }
      // If no stdout/stderr but has structured data — show compact summary
      if (lines.length === 0) {
        const dataKeys = Object.keys(step.outputs).filter(k => !LOG_OUTPUT_KEYS.has(k))
        if (dataKeys.length > 0) {
          lines.push({ time: '', text: `Completed with output: { ${dataKeys.join(', ')} }` })
        }
      }
    }
    if (step.error) {
      const msg = (step.error as Record<string, unknown>).message
      if (typeof msg === 'string') {
        lines.push({ time: '', text: msg })
      }
    }
    return lines
  }, [step.outputs, step.error, sseLines.length])

  const lines = sseLines.length > 0 ? sseLines : pollingLines
  const isWaiting = step.status === 'waiting_approval'

  const dataOutputs = useMemo(() => {
    if (!step.outputs) {return null}
    const filtered: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(step.outputs)) {
      if (!LOG_OUTPUT_KEYS.has(k)) {filtered[k] = v}
    }
    return Object.keys(filtered).length > 0 ? filtered : null
  }, [step.outputs])

  const hasData = dataOutputs !== null
  const hasInputs = step.spec?.with != null && Object.keys(step.spec.with).length > 0
  const hasError = step.error != null
  const hasTabs = hasData || hasInputs || hasError

  const logContent = (
    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
      {step.command && (
        <div style={{ padding: '4px 12px', color: '#8b949e', fontSize: 12 }}>
          $ {step.command}
        </div>
      )}
      {lines.length > 0 ? (
        <pre ref={logRef} style={{
          margin: 0,
          padding: '8px 12px',
          background: '#0d1117',
          color: '#c9d1d9',
          borderRadius: 4,
          overflow: 'auto',
          maxHeight: 400,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.6,
        }}>
          {lines.map((l, i) => (
            <span key={i}>
              {l.time && <span style={{ color: '#484f58', userSelect: 'none', marginRight: 12 }}>{l.time}</span>}
              <span style={l.stream === 'stderr' ? { color: '#f85149' } : undefined}>{l.text}</span>
              {'\n'}
            </span>
          ))}
        </pre>
      ) : (
        <Text type="secondary" style={{ fontSize: 12, padding: '4px 12px', display: 'block' }}>
          {step.status === 'running' ? 'Waiting for output...' :
           step.status === 'queued' ? 'Queued' :
           isWaiting ? 'Waiting for approval' :
           'No output'}
        </Text>
      )}
      {isWaiting && onApprove && (
        <div style={{ padding: '8px 12px' }}>
          <UIButton size="small" variant="primary" onClick={onApprove}>
            Review &amp; Decide
          </UIButton>
        </div>
      )}
    </div>
  )

  if (!hasTabs) {return logContent}

  const tabItems: UITabItem[] = [
    { key: 'log', label: 'Log', children: logContent },
  ]
  if (hasData) {
    tabItems.push({ key: 'data', label: 'Data', children: <UIJsonViewer data={dataOutputs} /> })
  }
  if (hasInputs) {
    tabItems.push({ key: 'inputs', label: 'Inputs', children: <UIJsonViewer data={step.spec!.with} /> })
  }
  if (hasError) {
    tabItems.push({ key: 'error', label: 'Error', children: <UIJsonViewer data={step.error} /> })
  }

  return <UITabs items={tabItems} size="small" defaultActiveKey="log" />
}

interface JobStepLogProps {
  events: WorkflowLogEvent[]
  run: WorkflowRun
  onApprove?: (step: StepRun) => void
}

function JobStepLog({ events, run, onApprove }: JobStepLogProps) {
  const groups = useMemo(() => buildLogGroups(events, run), [events, run])

  const stepRunMap = useMemo(() => {
    const map = new Map<string, StepRun>()
    for (const job of run.jobs) {
      for (const step of job.steps) {
        map.set(step.id, step)
      }
    }
    return map
  }, [run])

  if (groups.length === 0) {
    return <Text type="secondary">No execution data yet.</Text>
  }

  const activeJobKeys = groups
    .filter(g => g.status === 'running' || g.status === 'failed' || g.status === 'waiting_approval')
    .map(g => g.jobId)
  const defaultJobKeys = activeJobKeys.length > 0 ? activeJobKeys : groups.map(g => g.jobId)

  const jobItems: UIAccordionItem[] = groups.map(group => {
    const icon = STATUS_ICON[group.status] ?? '?'
    const color = STATUS_COLOR[group.status] ?? '#8b949e'
    const duration = group.durationMs ? formatDurationMs(group.durationMs) : null

    const activeStepKeys = group.steps
      .filter(s => s.status === 'running' || s.status === 'failed' || s.status === 'waiting_approval')
      .map(s => s.stepId)
    const defaultStepKeys = activeStepKeys.length > 0
      ? activeStepKeys
      : group.steps.filter(s => s.status !== 'queued').map(s => s.stepId)

    const stepItems: UIAccordionItem[] = group.steps.map(step => {
      const sIcon = STATUS_ICON[step.status] ?? '?'
      const sColor = STATUS_COLOR[step.status] ?? '#8b949e'
      const sDuration = step.durationMs ? formatDurationMs(step.durationMs) : null
      return {
        key: step.stepId,
        label: step.stepName,
        extra: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            {sDuration && <span style={{ color: '#8b949e' }}>{sDuration}</span>}
            <span style={{ color: sColor, fontWeight: 600, fontSize: 14 }}>{sIcon}</span>
          </span>
        ),
        children: (
          <StepPanel
            step={step}
            onApprove={
              step.status === 'waiting_approval' && onApprove
                ? () => {
                    const sr = stepRunMap.get(step.stepId)
                    if (sr) {onApprove(sr)}
                  }
                : undefined
            }
          />
        ),
      }
    })

    return {
      key: group.jobId,
      label: group.jobName,
      extra: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          {duration && <span style={{ color: '#8b949e' }}>{duration}</span>}
          <span style={{ color, fontWeight: 600, fontSize: 14 }}>{icon}</span>
        </span>
      ),
      children: (
        <>
          {group.error && group.status === 'failed' && (
            <UIAlert
              variant="error"
              message="Job failed"
              description={
                typeof group.error.message === 'string'
                  ? group.error.message
                  : JSON.stringify(group.error, null, 2)
              }
              showIcon
              style={{ marginBottom: 8 }}
            />
          )}
          {stepItems.length > 0 ? (
            <UIAccordion
              items={stepItems}
              defaultActiveKey={defaultStepKeys}
              size="small"
              ghost
              style={{ background: 'transparent' }}
            />
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>No steps.</Text>
          )}
        </>
      ),
    }
  })

  return (
    <UIAccordion
      items={jobItems}
      defaultActiveKey={defaultJobKeys}
      size="small"
      style={{ background: 'var(--bg-secondary, #f6f8fa)' }}
    />
  )
}

export default function WorkflowRunDetail() {
  const params = useParams<{ runId: string }>()
  const runId = params.runId ?? null
  const { data: runData, isLoading, error, refetch } = useData<{ run: WorkflowRun }>(
    runId ? `/exec/api/v1/runs/${runId}` : '/exec/api/v1/runs/__none__',
    { enabled: !!runId, pollingMs: 3000 },
  )
  const run = runData?.run ?? (runData as unknown as WorkflowRun | undefined)
  const cancelMutation = useMutateData<void, void>(`/exec/api/v1/runs/${runId ?? '__none__'}/cancel`)
  const resolveApproval = useMutateData<
    { runId: string; jobId: string; stepId: string; action: string; comment?: string },
    unknown
  >(`/exec/api/v1/runs/${runId ?? '__none__'}/approvals/resolve`)
  const isRunActive = run != null && !['success', 'failed', 'cancelled', 'skipped'].includes(run.status)

  const { events, error: logError, isConnected } = useSSE<WorkflowLogEvent>(
    isRunActive && runId ? `/exec/api/v1/runs/${runId}/events` : null,
    { params: { follow: 1 }, reconnect: true },
  )

  const [approvalStep, setApprovalStep] = useState<StepRun | null>(null)
  const [viewMode, setViewMode] = useState<'dashboard' | 'pipeline' | 'engineering'>('dashboard')

  const VIEW_MODES = {
    dashboard:   { label: 'Dashboard' },
    pipeline:    { label: 'Pipeline' },
    engineering: { label: 'Engineering' },
  } as const

  useEffect(() => {
    if (logError && isRunActive) {
      void refetch()
    }
  }, [logError, isRunActive, refetch])

  const isTerminal = run != null && !isRunActive

  const hasPendingApprovals = run?.jobs.some(j =>
    j.steps.some(s => (s.status as string) === 'waiting_approval')
  )

  const handleApprovalResolve = async (action: 'approve' | 'reject', comment?: string) => {
    if (!approvalStep || !runId) {return}
    const job = run?.jobs.find(j => j.steps.some(s => s.id === approvalStep.id))
    if (!job) {return}
    await resolveApproval.mutateAsync({
      runId,
      jobId: job.id,
      stepId: approvalStep.id,
      action,
      comment,
    })
    setApprovalStep(null)
    void refetch()
  }

  const shortRunId = runId ? `${runId.slice(0, 12)}...` : ''

  return (
    <UIPage>
      <UIPageHeader
        title={run?.name ?? `Workflow Run ${shortRunId}`}
        description={run ? `Run ${shortRunId}` : 'Detailed status of the workflow execution'}
        breadcrumbs={[
          { title: 'Home', href: '/' },
          { title: 'Workflows', href: '/workflows' },
          { title: 'Runs', href: '/p/workflows/runs' },
          { title: shortRunId },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <UIButton onClick={() => refetch()} disabled={isLoading}>
              Refresh
            </UIButton>
            {run && !isTerminal && (
              <UIButton
                danger
                loading={cancelMutation.isLoading}
                onClick={() => runId && cancelMutation.mutate()}
              >
                Cancel Run
              </UIButton>
            )}
          </div>
        }
      />

      {error && <UIAlert variant="error" message="Failed to load workflow run" description={String(error)} closable />}

      {hasPendingApprovals && (
        <UIAlert
          variant="warning"
          message="Waiting for your approval"
          description="One or more steps require your decision. Expand the step below to review."
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {isLoading && <UIPageSection><Text>Loading workflow run...</Text></UIPageSection>}
      {!isLoading && !run && !error && <UIPageSection><Text>Workflow run not found.</Text></UIPageSection>}
      {run && (
        <UIPageSection>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '12px 16px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 8,
            flexWrap: 'wrap',
          }}>
            <WorkflowStatusBadge status={run.status} />
            <Link
              to={`/p/workflows/definitions/${encodeURIComponent(run.name)}`}
              style={{ color: 'var(--link)', fontWeight: 500, fontSize: 14 }}
            >
              {run.name}
            </Link>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
              v{run.version}
            </span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
              by {run.trigger.actor ?? 'unknown'}
            </span>
            {run.startedAt && (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 13, marginLeft: 'auto' }}>
                {new Date(run.startedAt).toLocaleString()}
              </span>
            )}
            {run.result?.summary && (
              <span style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                borderTop: '1px solid var(--border-primary)',
                paddingTop: 8,
                width: '100%',
              }}>
                {run.result.summary}
              </span>
            )}
          </div>
        </UIPageSection>
      )}

      {run && (
        <UIPageSection>
          {/* View toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <Title level={4} style={{ margin: 0 }}>Execution</Title>
            <ViewModeSelector views={VIEW_MODES} current={viewMode} onChange={setViewMode} />
          </div>

          {isRunActive && !isConnected && !logError && <UIAlert variant="info" message="Connecting to event stream..." showIcon style={{ marginBottom: 12 }} />}
          {isRunActive && logError && <UIAlert variant="error" message="Event stream error" description={logError.message} style={{ marginBottom: 12 }} />}

          {viewMode === 'dashboard' && (
            <DashboardView
              run={run}
              onApprove={(step) => setApprovalStep(step)}
            />
          )}
          {viewMode === 'pipeline' && (
            <PipelineView
              run={run}
              events={events}
              onApprove={(step) => setApprovalStep(step)}
            />
          )}
          {viewMode === 'engineering' && (
            <JobStepLog
              events={events}
              run={run}
              onApprove={(step) => setApprovalStep(step)}
            />
          )}
        </UIPageSection>
      )}

      {run?.result && (
        <UIPageSection>
          <Title level={4}>Result Metrics</Title>
          {run.result.metrics ? (
            <UIList
              bordered
              size="small"
              dataSource={Object.entries(run.result.metrics).map(([key, value]) => ({
                key,
                value,
              }))}
              renderItem={({ key, value }) => (
                <UIListItem>
                  <Text strong>{key}</Text>
                  <span style={{ marginLeft: 8 }}>{String(value ?? '-')}</span>
                </UIListItem>
              )}
            />
          ) : (
            <Text type="secondary">No metrics recorded.</Text>
          )}
          {run.result.error && (
            <UIAlert
              style={{ marginTop: 16 }}
              variant="error"
              message={run.result.error.message}
              description={
                run.result.error.details ? JSON.stringify(run.result.error.details, null, 2) : undefined
              }
              showIcon
            />
          )}
        </UIPageSection>
      )}

      <ApprovalModal
        open={approvalStep !== null}
        step={approvalStep}
        runId={runId ?? ''}
        onClose={() => setApprovalStep(null)}
        onResolve={handleApprovalResolve}
        isLoading={resolveApproval.isLoading}
        error={resolveApproval.error instanceof Error ? resolveApproval.error : null}
      />
    </UIPage>
  )
}
