/**
 * Pipeline visualization.
 * Steps are rows, not cards — clean and scannable.
 * Gate rework: shows decision reason + feedback inline below gate row.
 */

import { useState, useRef, useEffect } from 'react'
import type { WorkflowRun, StepRun } from '@kb-labs/workflow-contracts'
import type { WorkflowLogEvent } from '@kb-labs/workflow-contracts/rest-api'
import { usePipelineModel } from '../../hooks/use-pipeline-graph'
import type { PipelineStep } from '../../hooks/use-pipeline-graph'
import { StepDetailDrawer } from './StepDetailDrawer'

// ─── CSS ──────────────────────────────────────────────────────────────────────

const ANIM_CSS = `
@keyframes kb-spin    { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
@keyframes kb-shimmer { 0% { left: -60% } 100% { left: 120% } }
`
let injected = false
function injectCss() {
  if (injected || typeof document === 'undefined') {return}
  injected = true
  const s = document.createElement('style')
  s.textContent = ANIM_CSS
  document.head.appendChild(s)
}

// ─── Status ───────────────────────────────────────────────────────────────────

const S_COLOR: Record<string, string> = {
  queued:           'var(--text-tertiary)',
  running:          'var(--warning)',
  success:          'var(--success)',
  failed:           'var(--error)',
  cancelled:        'var(--text-tertiary)',
  skipped:          'var(--text-tertiary)',
  waiting_approval: 'var(--info)',
}

const S_LABEL: Record<string, string> = {
  queued:           'Queued',
  running:          'Running',
  success:          'Done',
  failed:           'Failed',
  cancelled:        'Cancelled',
  skipped:          'Skipped',
  waiting_approval: 'Review',
}

function StatusDot({ status }: { status: string }) {
  injectCss()
  const color = S_COLOR[status] ?? 'var(--text-tertiary)'
  if (status === 'running') {
    return <span style={{
      display: 'inline-block', width: 8, height: 8, flexShrink: 0,
      border: `2px solid ${color}`, borderTopColor: 'transparent',
      borderRadius: '50%', animation: 'kb-spin 0.8s linear infinite',
    }} />
  }
  const filled = status === 'success' || status === 'failed' || status === 'waiting_approval'
  return <span style={{
    display: 'inline-block', width: 8, height: 8, flexShrink: 0,
    borderRadius: '50%',
    background: filled ? color : 'transparent',
    border: `2px solid ${color}`,
  }} />
}

function formatDuration(ms?: number) {
  if (!ms) {return null}
  if (ms < 1000) {return `${ms}ms`}
  const s = ms / 1000
  if (s < 60) {return `${s.toFixed(1)}s`}
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`
}

// ─── Phase colors ─────────────────────────────────────────────────────────────

const PHASE_COLOR: Record<string, string> = {
  Planning:       'var(--info)',
  Implementation: 'var(--success)',
  Quality:        'var(--warning)',
  Delivery:       'var(--link)',
}

// ─── Gate decision banner ─────────────────────────────────────────────────────

interface GateOutputs {
  decisionValue?: unknown
  action?: 'continue' | 'fail' | 'restart'
  restartFrom?: string
  iteration?: number
  maxIterations?: number
  maxIterationsReached?: boolean
}

function GateDecisionBanner({ stepRun, targetStepName }: { stepRun: StepRun; targetStepName?: string }) {
  const outputs = stepRun.outputs as GateOutputs | undefined
  const error   = stepRun.error as Record<string, unknown> | undefined | null

  // Show banner if: outputs have non-continue action, OR step failed (even without outputs)
  const action    = outputs?.action ?? (stepRun.status === 'failed' ? 'fail' : undefined)
  const decision  = outputs?.decisionValue
  const iteration = outputs?.iteration

  if (!action || action === 'continue') {return null}

  const isRestart = action === 'restart'

  const color   = isRestart ? 'var(--warning)' : 'var(--error)'
  const bgColor = isRestart
    ? 'color-mix(in srgb, var(--warning) 6%, var(--bg-secondary))'
    : 'color-mix(in srgb, var(--error) 6%, var(--bg-secondary))'

  const errorMsg = typeof error?.message === 'string' ? error.message : null
  const maxIterReached = outputs?.maxIterationsReached
    ?? (errorMsg?.toLowerCase().includes('max iteration') ?? false)

  return (
    <div style={{
      margin: '2px 0 4px 18px',
      padding: '8px 12px',
      background: bgColor,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      borderRadius: 5,
      fontSize: 12,
      lineHeight: 1.6,
    }}>
      {/* Header line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color, fontWeight: 600 }}>
          {isRestart ? '↩ Returned for rework' : '✗ Gate failed'}
        </span>
        {iteration !== undefined && (
          <span style={{
            color: 'var(--text-tertiary)',
            background: 'var(--bg-tertiary)',
            padding: '0 5px', borderRadius: 4, fontSize: 11,
          }}>
            iteration {iteration + 1}
          </span>
        )}
      </div>

      {/* Decision value */}
      {decision !== undefined && decision !== null && (
        <div style={{ color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Decision: </span>
          <code style={{
            fontSize: 11,
            background: 'var(--bg-tertiary)',
            padding: '0 4px', borderRadius: 3,
            color: color,
            fontFamily: 'monospace',
          }}>
            {String(decision)}
          </code>
        </div>
      )}

      {/* Restart target */}
      {isRestart && targetStepName && (
        <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
          <span style={{ color: 'var(--text-tertiary)' }}>Restarting from: </span>
          <span style={{ fontWeight: 500 }}>{targetStepName}</span>
        </div>
      )}

      {/* Max iterations reached */}
      {maxIterReached && (
        <div style={{ color: 'var(--error)', marginTop: 2 }}>
          Max iterations reached — pipeline stopped
        </div>
      )}

      {/* Error message (if not max iter) */}
      {errorMsg && !maxIterReached && (
        <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>
          {errorMsg}
        </div>
      )}
    </div>
  )
}

// ─── StepRow ─────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: PipelineStep
  isReworkGate: boolean
  isReworkTarget: boolean
  reworkActive: boolean
  targetStepName?: string
  onClick: () => void
  rowRef?: (el: HTMLDivElement | null) => void
}

function StepRow({ step, isReworkGate, isReworkTarget, reworkActive, targetStepName, onClick, rowRef }: StepRowProps) {
  const { stepRun, stepType, iteration } = step
  const status    = stepRun.status
  const isWaiting = status === 'waiting_approval'
  const isFailed  = status === 'failed'
  const isRunning = status === 'running'
  const isQueued  = status === 'queued'
  const isApproval = stepType === 'approval'
  const isGate     = stepType === 'gate'

  // Gate outputs for restart detection
  const gateOutputs = isGate ? stepRun.outputs as GateOutputs | undefined : undefined
  const gateAction  = gateOutputs?.action
  const showBanner  = isGate && (gateAction === 'restart' || gateAction === 'fail' || isFailed)

  const highlight = isWaiting
    ? { bg: 'color-mix(in srgb, var(--info) 5%, var(--bg-secondary))',    border: 'var(--info)' }
    : isFailed
    ? { bg: 'color-mix(in srgb, var(--error) 5%, var(--bg-secondary))',   border: 'var(--error)' }
    : isReworkTarget && reworkActive
    ? { bg: 'color-mix(in srgb, var(--warning) 5%, var(--bg-secondary))', border: 'var(--warning)' }
    : null

  return (
    <>
      <div
        ref={rowRef}
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: highlight ? '10px 14px' : '7px 14px',
          marginLeft: isApproval ? 28 : 0,
          borderRadius: 6,
          background: highlight?.bg ?? 'transparent',
          border: highlight ? `1px solid ${highlight.border}` : '1px solid transparent',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => {
          if (!highlight) {(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'}
        }}
        onMouseLeave={e => {
          if (!highlight) {(e.currentTarget as HTMLDivElement).style.background = 'transparent'}
        }}
      >
        {isRunning && (
          <div style={{
            position: 'absolute', top: 0, left: 0, height: 2, width: '45%',
            background: 'linear-gradient(90deg, transparent, var(--warning), transparent)',
            animation: 'kb-shimmer 1.4s ease-in-out infinite',
          }} />
        )}

        <StatusDot status={status} />

        <span style={{
          flex: 1,
          fontSize: 14,
          color: isQueued ? 'var(--text-tertiary)' : 'var(--text-primary)',
          fontWeight: isWaiting || isFailed ? 500 : 400,
          fontStyle: isGate ? 'italic' : 'normal',
        }}>
          {isApproval && <span style={{ color: 'var(--info)', marginRight: 5, fontStyle: 'normal', fontSize: 12 }}>⏸</span>}
          {stepRun.name}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {isReworkGate && iteration && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--warning)',
              background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
              padding: '1px 7px', borderRadius: 8,
            }}>
              ↩ {iteration.current}/{iteration.max}
            </span>
          )}
          {formatDuration(stepRun.durationMs) && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {formatDuration(stepRun.durationMs)}
            </span>
          )}
          {isWaiting ? (
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--info)',
              background: 'color-mix(in srgb, var(--info) 12%, transparent)',
              padding: '2px 9px', borderRadius: 8,
            }}>
              Review
            </span>
          ) : (
            <span style={{
              fontSize: 12,
              color: S_COLOR[status] ?? 'var(--text-tertiary)',
              minWidth: 44, textAlign: 'right',
            }}>
              {S_LABEL[status] ?? status}
            </span>
          )}
        </div>
      </div>

      {/* Gate decision inline — shows why it restarted and where */}
      {showBanner && (
        <GateDecisionBanner stepRun={stepRun} targetStepName={targetStepName} />
      )}
    </>
  )
}

// ─── ReworkBracket ────────────────────────────────────────────────────────────

function ReworkBracket({
  gateEl, targetEl, containerEl, isActive,
}: {
  gateEl: HTMLDivElement | null
  targetEl: HTMLDivElement | null
  containerEl: HTMLDivElement | null
  isActive: boolean
}) {
  const [pos, setPos] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    if (!gateEl || !targetEl || !containerEl) {return}
    const measure = () => {
      const cr = containerEl.getBoundingClientRect()
      const gr = gateEl.getBoundingClientRect()
      const tr = targetEl.getBoundingClientRect()
      setPos({
        top: tr.top - cr.top + tr.height / 2,
        height: Math.max(0, gr.top - cr.top + gr.height / 2 - (tr.top - cr.top + tr.height / 2)),
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(containerEl)
    ro.observe(gateEl)
    ro.observe(targetEl)
    return () => ro.disconnect()
  }, [gateEl, targetEl, containerEl])
  if (!pos || pos.height < 8) {return null}
  const color = isActive ? 'var(--warning)' : 'var(--border-primary)'
  return (
    <div style={{ position: 'absolute', left: 0, top: pos.top, width: 8, height: pos.height, pointerEvents: 'none' }}>
      <svg width={8} height={pos.height} overflow="visible">
        <line x1={5} y1={0} x2={5} y2={pos.height}
          stroke={color} strokeWidth={isActive ? 2 : 1.5}
          strokeDasharray={isActive ? undefined : '3 3'} />
        <polygon points="2,6 5,0 8,6" fill={color} />
      </svg>
    </div>
  )
}

// ─── PipelineView ─────────────────────────────────────────────────────────────

interface PipelineViewProps {
  run: WorkflowRun
  events: WorkflowLogEvent[]
  onApprove?: (step: StepRun) => void
}

export function PipelineView({ run, events, onApprove }: PipelineViewProps) {
  const model = usePipelineModel(run)
  const [selected, setSelected] = useState<StepRun | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const setRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) {rowRefs.current.set(id, el)}
    else {rowRefs.current.delete(id)}
  }

  if (!model.steps.length) {
    return <div style={{ padding: '24px 0', color: 'var(--text-tertiary)', fontSize: 14 }}>No execution data yet.</div>
  }

  const { reworkLoop } = model
  const gateStep   = reworkLoop ? model.steps[reworkLoop.gateIndex]   : null
  const targetStep = reworkLoop ? model.steps[reworkLoop.targetIndex] : null
  const stepEvents = events.filter(e => e.stepId === selected?.id)

  return (
    <div ref={containerRef} style={{ position: 'relative', paddingLeft: 10 }}>
      {reworkLoop && gateStep && targetStep && (
        <ReworkBracket
          gateEl={rowRefs.current.get(gateStep.stepRun.id) ?? null}
          targetEl={rowRefs.current.get(targetStep.stepRun.id) ?? null}
          containerEl={containerRef.current}
          isActive={reworkLoop.isActive}
        />
      )}

      {model.phases.map((phase, pi) => {
        const color     = PHASE_COLOR[phase.label] ?? 'var(--text-tertiary)'
        const doneCount = phase.steps.filter(s => s.stepRun.status === 'success').length
        const isLast    = pi === model.phases.length - 1

        return (
          <div key={phase.label} style={{ marginBottom: isLast ? 0 : 20 }}>
            {/* Phase label */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 4px', marginBottom: 4,
            }}>
              <div style={{ width: 3, height: 12, background: color, borderRadius: 2, flexShrink: 0 }} />
              <span style={{
                fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.09em',
                color,
              }}>
                {phase.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                {doneCount}/{phase.steps.length}
              </span>
            </div>

            {/* Steps */}
            <div style={{
              borderLeft: `2px solid color-mix(in srgb, ${color} 25%, var(--border-primary))`,
              marginLeft: 5,
              paddingLeft: 12,
              paddingTop: 2,
              paddingBottom: 2,
            }}>
              {phase.steps.map(step => {
                const flatIdx = model.steps.indexOf(step)
                const isGateWithLoop = reworkLoop?.gateIndex === flatIdx
                return (
                  <StepRow
                    key={step.stepRun.id}
                    step={step}
                    isReworkGate={isGateWithLoop ?? false}
                    isReworkTarget={reworkLoop?.targetIndex === flatIdx}
                    reworkActive={reworkLoop?.isActive ?? false}
                    targetStepName={isGateWithLoop ? targetStep?.stepRun.name : undefined}
                    onClick={() => setSelected(step.stepRun)}
                    rowRef={setRef(step.stepRun.id)}
                  />
                )
              })}
            </div>
          </div>
        )
      })}

      <StepDetailDrawer
        step={selected}
        events={stepEvents}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onApprove={
          selected?.status === 'waiting_approval' && onApprove
            ? () => { onApprove(selected); setSelected(null) }
            : undefined
        }
      />
    </div>
  )
}
