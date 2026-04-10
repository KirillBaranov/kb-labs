/**
 * Dashboard view for a single workflow run.
 * Shows: PhaseProgressBar → Hero block (current step) → Completed steps → Future steps
 */

import * as React from 'react';
import {
  UITypographyText,
  UISpace,
  UIIcon,
  UITag,
} from '@kb-labs/sdk/studio';
import type { WorkflowRun, StepRun, StepArtifact } from '@kb-labs/workflow-contracts';
import { PhaseProgressBar, type PhaseStatus } from '../shared/PhaseProgressBar';
import { usePipelineModel } from '../../hooks/use-pipeline-graph';
import { StatusDot } from '../pipeline/shared';
import { ArtifactViewer } from '../artifacts/ArtifactViewer';

// Runtime fields not yet in the schema — accessed via type assertion
interface StepRunRuntime extends StepRun {
  progress?: number;
  progressMessage?: string;
}

function getPhaseStatuses(run: WorkflowRun): PhaseStatus[] {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const model = usePipelineModel(run);
  return model.phases.map((phase) => {
    const allDone = phase.steps.every((s) => s.stepRun.status === 'success');
    const anyActive = phase.steps.some(
      (s) => s.stepRun.status === 'running' || s.stepRun.status === 'waiting_approval',
    );
    return {
      label: phase.label,
      status: allDone ? 'done' : anyActive ? 'active' : 'pending',
    };
  });
}

function flatSteps(run: WorkflowRun): StepRun[] {
  return run.jobs.flatMap((j) => j.steps);
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) { return `${ms}ms`; }
  const s = ms / 1000;
  if (s < 60) { return `${s.toFixed(1)}s`; }
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}

interface HeroBlockProps {
  step: StepRun;
  onApprove?: () => void;
}

function HeroBlock({ step, onApprove }: HeroBlockProps) {
  const rt = step as StepRunRuntime;
  const isWaiting = step.status === 'waiting_approval';
  const isRunning = step.status === 'running';
  // artifacts is Record<name, StepArtifact> in contracts
  const artifactsMap = (step.spec?.artifacts) as Record<string, StepArtifact> | undefined;
  const artifacts = artifactsMap ? Object.values(artifactsMap) : [];

  return (
    <div style={{
      padding: '20px 24px',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
      borderRadius: 10,
      marginBottom: 'var(--spacing-section)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <StatusDot status={step.status} />
        <UITypographyText style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          {step.spec?.summary ?? step.name}
        </UITypographyText>
        {step.durationMs && (
          <UITypographyText className="typo-caption text-tertiary" style={{ marginLeft: 'auto' }}>
            {formatDurationMs(step.durationMs)}
          </UITypographyText>
        )}
      </div>

      {/* Progress message */}
      {rt.progressMessage && (
        <UITypographyText className="typo-description text-secondary" style={{ marginBottom: 10, display: 'block' }}>
          {rt.progressMessage}
        </UITypographyText>
      )}

      {/* Progress bar */}
      {rt.progress != null && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            height: 6,
            background: 'var(--border-primary)',
            borderRadius: 3,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${rt.progress}%`,
              background: isWaiting ? 'var(--warning)' : 'var(--link)',
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <UITypographyText className="typo-caption text-tertiary" style={{ marginTop: 4, display: 'block' }}>
            {rt.progress}%
          </UITypographyText>
        </div>
      )}

      {/* Artifacts */}
      {artifacts.length > 0 && step.outputs && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {artifacts.map((artifact, i) => {
            // Resolve dot-path from outputs
            const data = artifact.source.split('.').reduce<unknown>(
              (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
              step,
            );
            return (
              <div key={i}>
                <UITypographyText className="typo-label text-secondary" style={{ display: 'block', marginBottom: 6 }}>
                  {artifact.label}
                </UITypographyText>
                <ArtifactViewer type={artifact.type} data={data} label={artifact.label} />
              </div>
            );
          })}
        </div>
      )}

      {/* Approval CTA */}
      {isWaiting && onApprove && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={onApprove}
            style={{
              padding: '6px 16px',
              background: 'var(--link)',
              color: 'var(--text-inverse)',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Review &amp; Decide
          </button>
        </div>
      )}

      {/* Running indicator */}
      {isRunning && !rt.progressMessage && (
        <UISpace className="gap-tight" style={{ marginTop: 6 }}>
          <UIIcon name="LoadingOutlined" spin style={{ color: 'var(--link)', fontSize: 13 }} />
          <UITypographyText className="typo-caption text-secondary">Running...</UITypographyText>
        </UISpace>
      )}
    </div>
  );
}

interface DashboardViewProps {
  run: WorkflowRun;
  onApprove?: (step: StepRun) => void;
}

const TERMINAL = ['success', 'failed', 'cancelled', 'skipped'];

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: 1,
      padding: '16px 20px',
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
      borderRadius: 8,
      minWidth: 0,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

export function DashboardView({ run, onApprove }: DashboardViewProps) {
  const model = usePipelineModel(run);
  const phases = model.phases.map((phase) => {
    const allDone = phase.steps.every((s) => s.stepRun.status === 'success');
    const anyActive = phase.steps.some(
      (s) => s.stepRun.status === 'running' || s.stepRun.status === 'waiting_approval',
    );
    return { label: phase.label, status: allDone ? 'done' : anyActive ? 'active' : 'pending' } as PhaseStatus;
  });

  const allSteps = flatSteps(run);
  const isTerminal = TERMINAL.includes(run.status);

  const currentStep = !isTerminal
    ? allSteps.find((s) => s.status === 'running' || s.status === 'waiting_approval')
    : null;
  const completedSteps = allSteps.filter((s) => s.status === 'success');
  const failedSteps = allSteps.filter((s) => s.status === 'failed');
  const futureSteps = allSteps.filter((s) => s.status === 'queued' || (s.status as string) === 'pending');

  // Total duration
  const totalMs = run.startedAt && run.finishedAt
    ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
    : null;

  // Steps grouped by phase for terminal view
  const stepsByPhase = model.phases.map((phase) => ({
    label: phase.label,
    steps: phase.steps.map((s) => s.stepRun),
  }));
  const ungroupedSteps = model.phases.length === 0 ? allSteps : [];

  // Summary artifacts — any completed/failed step with showInSummary: true artifacts
  // Shown both during active runs (for completed steps) and after terminal
  const summaryArtifacts: { step: StepRun; artifact: StepArtifact; data: unknown }[] = [];
  for (const step of allSteps) {
    if (step.status !== 'success' && step.status !== 'failed') {continue;}
    const artifactsMap = (step.spec?.artifacts) as Record<string, StepArtifact> | undefined;
    if (!artifactsMap) {continue;}
    for (const artifact of Object.values(artifactsMap)) {
      if (!artifact.showInSummary) {continue;}
      const data = artifact.source.split('.').reduce<unknown>(
        (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
        step,
      );
      summaryArtifacts.push({ step, artifact, data });
    }
  }

  return (
    <div>
      {/* Phase bar */}
      {phases.length > 0 && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 8,
          marginBottom: 16,
        }}>
          <PhaseProgressBar phases={phases} />
        </div>
      )}

      {/* ── ACTIVE RUN: hero block ── */}
      {currentStep && (
        <HeroBlock
          step={currentStep}
          onApprove={onApprove ? () => onApprove(currentStep) : undefined}
        />
      )}

      {/* ── Summary artifacts (showInSummary: true) — shown as steps complete ── */}
      {summaryArtifacts.length > 0 && (() => {
        const links = summaryArtifacts.filter(a => a.artifact.type === 'link');
        const rich = summaryArtifacts.filter(a => a.artifact.type !== 'link');
        return (
          <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* link artifacts — inline row */}
            {links.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {links.map(({ artifact, data }, i) => (
                  <ArtifactViewer key={i} type="link" data={data} label={artifact.label} />
                ))}
              </div>
            )}
            {/* rich artifacts — full-width blocks */}
            {rich.length > 0 && (
              <div style={{
                padding: '16px 20px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 10,
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                {rich.map(({ artifact, data }, i) => (
                  <div key={i}>
                    <UITypographyText className="typo-label text-secondary" style={{ display: 'block', marginBottom: 6 }}>
                      {artifact.label}
                    </UITypographyText>
                    <ArtifactViewer type={artifact.type} data={data} label={artifact.label} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── TERMINAL RUN: summary stats ── */}
      {isTerminal && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Total steps" value={String(allSteps.length)} />
          <StatCard label="Completed" value={String(completedSteps.length)} color="var(--success)" />
          {failedSteps.length > 0 && (
            <StatCard label="Failed" value={String(failedSteps.length)} color="var(--error)" />
          )}
          {totalMs != null && (
            <StatCard label="Duration" value={formatDurationMs(totalMs)} />
          )}
        </div>
      )}

      {/* ── TERMINAL RUN: steps by phase ── */}
      {isTerminal && stepsByPhase.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {stepsByPhase.map((phase) => (
            <div key={phase.label}>
              <UITypographyText className="typo-label text-secondary" style={{ display: 'block', marginBottom: 8 }}>
                {phase.label}
              </UITypographyText>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {phase.steps.map((step) => (
                  <div key={step.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 12px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 6,
                  }}>
                    <UIIcon
                      name={step.status === 'success' ? 'CheckCircleOutlined' : step.status === 'failed' ? 'CloseCircleOutlined' : 'MinusCircleOutlined'}
                      style={{ fontSize: 13, color: step.status === 'success' ? 'var(--success)' : step.status === 'failed' ? 'var(--error)' : 'var(--text-tertiary)', flexShrink: 0 }}
                    />
                    <UITypographyText className="typo-body" style={{ flex: 1, minWidth: 0 }}>
                      {step.spec?.summary ?? step.name}
                    </UITypographyText>
                    {step.durationMs && (
                      <UITypographyText className="typo-caption text-tertiary" style={{ flexShrink: 0 }}>
                        {formatDurationMs(step.durationMs)}
                      </UITypographyText>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TERMINAL RUN: no phases — flat list ── */}
      {isTerminal && ungroupedSteps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ungroupedSteps.map((step) => (
            <div key={step.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
            }}>
              <UIIcon
                name={step.status === 'success' ? 'CheckCircleOutlined' : step.status === 'failed' ? 'CloseCircleOutlined' : 'MinusCircleOutlined'}
                style={{ fontSize: 13, color: step.status === 'success' ? 'var(--success)' : step.status === 'failed' ? 'var(--error)' : 'var(--text-tertiary)', flexShrink: 0 }}
              />
              <UITypographyText className="typo-body" style={{ flex: 1 }}>
                {step.spec?.summary ?? step.name}
              </UITypographyText>
              {step.durationMs && (
                <UITypographyText className="typo-caption text-tertiary">
                  {formatDurationMs(step.durationMs)}
                </UITypographyText>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── ACTIVE RUN: completed + upcoming ── */}
      {!isTerminal && completedSteps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <UITypographyText className="typo-label text-secondary" style={{ display: 'block', marginBottom: 8 }}>
            Completed ({completedSteps.length})
          </UITypographyText>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {completedSteps.map((step) => (
              <div key={step.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 6,
              }}>
                <UIIcon name="CheckCircleOutlined" style={{ color: 'var(--success)', fontSize: 13 }} />
                <UITypographyText className="typo-body">{step.spec?.summary ?? step.name}</UITypographyText>
                {step.durationMs && (
                  <UITypographyText className="typo-caption text-tertiary" style={{ marginLeft: 'auto' }}>
                    {formatDurationMs(step.durationMs)}
                  </UITypographyText>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!isTerminal && futureSteps.length > 0 && (
        <div>
          <UITypographyText className="typo-label text-secondary" style={{ display: 'block', marginBottom: 8 }}>
            Upcoming ({futureSteps.length})
          </UITypographyText>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {futureSteps.map((step) => (
              <div key={step.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                border: '1px dashed var(--border-primary)',
                borderRadius: 6,
                opacity: 0.5,
              }}>
                <UIIcon name="ClockCircleOutlined" style={{ color: 'var(--text-tertiary)', fontSize: 13 }} />
                <UITypographyText className="typo-body text-secondary">{step.spec?.summary ?? step.name}</UITypographyText>
                {step.spec?.phase && (
                  <UITag style={{ marginLeft: 'auto', opacity: 0.7 }}>{step.spec.phase}</UITag>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {allSteps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <UITypographyText className="typo-description text-secondary">No execution data</UITypographyText>
        </div>
      )}
    </div>
  );
}
