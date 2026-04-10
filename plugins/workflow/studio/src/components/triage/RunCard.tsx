/**
 * Compact run card for triage/board views.
 * Shows workflow name, task, current status, phase progress, and duration.
 */

import * as React from 'react';
import type { WorkflowRun } from '@kb-labs/workflow-contracts';
import { StatusDot, formatDuration } from '../pipeline/shared';
import { PhaseProgressBar } from '../shared/PhaseProgressBar';
import { usePipelineModel } from '../../hooks/use-pipeline-graph';
import type { PhaseStatus } from '../shared/PhaseProgressBar';

function getCurrentStepInfo(run: WorkflowRun): { name: string; summary?: string; status: string } | null {
  for (const job of run.jobs) {
    for (const step of job.steps) {
      if (step.status === 'running' || step.status === 'waiting_approval') {
        return {
          name: step.name,
          summary: step.spec?.summary,
          status: step.status,
        };
      }
    }
  }
  return null;
}

function getTaskDescription(run: WorkflowRun): string {
  const payload = run.trigger.payload;
  if (payload?.task && typeof payload.task === 'string') { return payload.task; }
  return '';
}

interface RunCardProps {
  run: WorkflowRun;
  onClick: () => void;
}

export function RunCard({ run, onClick }: RunCardProps) {
  const model = usePipelineModel(run);
  const phases: PhaseStatus[] = model.phases.map((phase) => {
    const allDone = phase.steps.every((s) => s.stepRun.status === 'success');
    const anyActive = phase.steps.some(
      (s) => s.stepRun.status === 'running' || s.stepRun.status === 'waiting_approval',
    );
    return {
      label: phase.label,
      status: allDone ? 'done' as const : anyActive ? 'active' as const : 'pending' as const,
    };
  });

  const currentStep = getCurrentStepInfo(run);
  const task = getTaskDescription(run);
  const duration = run.startedAt
    ? formatDuration(
        (run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now()) -
        new Date(run.startedAt).getTime(),
      )
    : null;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.borderColor = 'var(--link)')}
      onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => (e.currentTarget.style.borderColor = 'var(--border-primary)')}
    >
      {/* Header: name + duration */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
          {run.name}
        </span>
        {duration && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{duration}</span>
        )}
      </div>

      {/* Task description */}
      {task && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {task}
        </div>
      )}

      {/* Phase progress */}
      {phases.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <PhaseProgressBar phases={phases} compact />
        </div>
      )}

      {/* Current step */}
      {currentStep && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={currentStep.status} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {currentStep.summary ?? currentStep.name}
          </span>
        </div>
      )}

      {/* Error summary for failed runs */}
      {run.status === 'failed' && run.result?.error && (
        <div style={{
          fontSize: 12, color: 'var(--error)', marginTop: 6,
          padding: '4px 8px', background: 'color-mix(in srgb, var(--error) 6%, transparent)',
          borderRadius: 4,
        }}>
          {run.result.error.message}
        </div>
      )}
    </div>
  );
}
