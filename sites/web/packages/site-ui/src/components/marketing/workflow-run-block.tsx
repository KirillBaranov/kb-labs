'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

// Real data from pr-review-gate runs (2026-05-23)
const LINES: Array<
  | { type: 'cmd'; text: string }
  | { type: 'snapshot'; text: string }
  | { type: 'event'; dot: '·' | '✓'; label: string; detail?: string; duration?: string }
  | { type: 'info'; text: string }
> = [
  { type: 'cmd',      text: 'kb workflow run pr-review-gate' },
  { type: 'snapshot', text: 'pr-review-gate v1.0 · job: validate' },
  { type: 'event',    dot: '·', label: 'step.started',   detail: 'Run Tests' },
  { type: 'info',     text: 'Running 129 test suites…' },
  { type: 'event',    dot: '·', label: 'step.succeeded', detail: 'Run Tests',   duration: '69.6s' },
  { type: 'info',     text: 'passed=true  total=142  failed=0  coverage=87%' },
  { type: 'event',    dot: '·', label: 'step.started',   detail: 'Type Check' },
  { type: 'event',    dot: '·', label: 'step.succeeded', detail: 'Type Check',  duration: '0.8s' },
  { type: 'event',    dot: '·', label: 'step.started',   detail: 'Lint' },
  { type: 'event',    dot: '·', label: 'step.succeeded', detail: 'Lint',        duration: '0.7s' },
  { type: 'info',     text: 'warnings=3  errors=0' },
  { type: 'event',    dot: '·', label: 'job.succeeded' },
  { type: 'event',    dot: '✓', label: 'run.finished',   detail: 'SUCCESS' },
];

// Delay before each line appears (ms, cumulative)
const LINE_DELAYS = [
  0, 300,
  500, 600, 2200, 2400,
  2700, 3000,
  3200, 3500, 3650,
  3900, 4200,
];

export interface WorkflowRunBlockProps {
  className?: string;
}

export function WorkflowRunBlock({ className }: WorkflowRunBlockProps) {
  const [visibleCount, setVisibleCount] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  const hasStarted = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || hasStarted.current) return;
        hasStarted.current = true;

        LINE_DELAYS.forEach((delay, i) => {
          const id = setTimeout(() => {
            setVisibleCount((c) => Math.max(c, i + 1));
          }, delay);
          timeoutIds.push(id);
        });
      },
      { threshold: 0.25 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      timeoutIds.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-line overflow-hidden shadow-card-lg font-mono text-[0.72rem] leading-[1.6] text-left',
        className
      )}
    >
      {/* Title bar */}
      <div className="bg-surface border-b border-line px-4 py-2.5 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[0.65rem] text-muted/60 mx-auto">Terminal</span>
      </div>

      {/* Body — always uses a dark terminal palette regardless of page theme */}
      <div
        className="p-4 min-h-[260px]"
        style={{ background: '#0f1117', color: '#e2e6f0' }}
        aria-live="polite"
        aria-label="Workflow run output"
      >
        {LINES.slice(0, visibleCount).map((line, i) => {
          if (line.type === 'cmd') {
            return (
              <div key={i} className="mb-2">
                <span style={{ color: '#4e5568' }} className="mr-2">$</span>
                <span style={{ color: '#e2e6f0' }}>{line.text}</span>
              </div>
            );
          }

          if (line.type === 'snapshot') {
            return (
              <div key={i} className="mb-2" style={{ color: '#4e5568' }}>
                <span className="mr-2">⠿</span>
                <span>{line.text}</span>
              </div>
            );
          }

          if (line.type === 'info') {
            return (
              <div key={i} className="mb-1" style={{ paddingLeft: 'calc(1.5ch + 15ch + 1rem)', color: '#323844' }}>
                {line.text}
              </div>
            );
          }

          // event line
          const isSuccess = line.dot === '✓' || line.label === 'step.succeeded' || line.label === 'job.succeeded';
          const isRunFinished = line.label === 'run.finished';

          const dotColor   = isRunFinished ? '#34d399' : isSuccess ? 'rgba(52,211,153,0.6)' : '#4e5568';
          const labelColor = isRunFinished ? '#34d399' : '#5a6578';
          const detailColor = isRunFinished ? '#34d399' : '#8892a4';

          return (
            <div
              key={i}
              className={cn('grid mb-0.5', isRunFinished && 'mt-2')}
              style={{ gridTemplateColumns: '1.5ch 15ch 1fr auto', columnGap: '0.5rem' }}
            >
              <span style={{ color: dotColor }}>{line.dot}</span>
              <span style={{ color: labelColor, fontWeight: isRunFinished ? 600 : undefined }}>{line.label}</span>
              <span style={{ color: detailColor, fontWeight: isRunFinished ? 600 : undefined }}>{line.detail ?? ''}</span>
              <span style={{ color: '#3a424e' }} className="pl-4">{line.duration ?? ''}</span>
            </div>
          );
        })}

        {/* Cursor — shows while still animating */}
        {visibleCount < LINES.length && (
          <span className="animate-pulse" style={{ color: '#4e5568' }}>_</span>
        )}
      </div>
    </div>
  );
}
