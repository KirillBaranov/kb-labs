'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface WorkflowDiagramProps {
  className?: string;
}

// Animation delay constants (ms)
const DELAYS = {
  step1:         0,
  step1Badge:  500,
  connector1:  450,
  step2:       550,
  step2Badge: 1500,
  connector2: 1550,
  condition:  1650,
  branch:     1800,
  branchDrop: 1900,
  leafLeft:   2000,
  leafRight:  2100,
} as const;

function step(delay: number) {
  return {
    'data-animate': 'slide-up',
    style: { '--anim-delay': `${delay}ms` } as React.CSSProperties,
  };
}

function connector(delay: number) {
  return {
    'data-animate': 'grow-down',
    style: { '--anim-delay': `${delay}ms` } as React.CSSProperties,
  };
}

function hline(delay: number) {
  return {
    'data-animate': 'grow-right',
    style: { '--anim-delay': `${delay}ms` } as React.CSSProperties,
  };
}

function fade(delay: number) {
  return {
    'data-animate': 'fade',
    style: { '--anim-delay': `${delay}ms` } as React.CSSProperties,
  };
}

function RunBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-bg px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-muted/50 ring-1 ring-inset ring-line">
      run
    </span>
  );
}

function AgentBadge() {
  return (
    <span className="inline-flex items-center rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/20">
      agent
    </span>
  );
}

export function WorkflowDiagram({ className }: WorkflowDiagramProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const vis = visible ? '' : undefined;

  return (
    <div ref={ref} className={cn('w-full select-none', className)}>

      {/* Step 1: fetch-diff */}
      <div {...step(DELAYS.step1)} data-visible={vis} className="rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RunBadge />
            <span className="font-mono text-sm font-semibold text-kb-text">fetch-diff</span>
          </div>
          <span {...fade(DELAYS.step1Badge)} data-visible={vis} className="font-mono text-[0.7rem] text-emerald-500/80">
            ✓ 312ms
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[0.72rem] text-muted/60">
          git.diff · pr: <span className="text-muted/80">{`{{ env.PR_NUMBER }}`}</span>
        </div>
      </div>

      {/* Connector */}
      <div className="flex justify-center">
        <div {...connector(DELAYS.connector1)} data-visible={vis} className="h-6 w-px bg-line-strong" />
      </div>

      {/* Step 2: review (agent) */}
      <div {...step(DELAYS.step2)} data-visible={vis} className="rounded-xl border border-accent/20 bg-accent/[0.03] px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AgentBadge />
            <span className="font-mono text-sm font-semibold text-kb-text">review</span>
          </div>
          <span {...fade(DELAYS.step2Badge)} data-visible={vis} className="font-mono text-[0.7rem] text-emerald-500/80">
            ✓ 2.8s
          </span>
        </div>
        <div className="mt-1.5 font-mono text-[0.72rem] text-muted/60">claude-sonnet-4-6</div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
          {[
            { ok: true,  label: 'github.api' },
            { ok: false, label: 'shell.exec' },
            { ok: true,  label: 'git.read' },
            { ok: false, label: 'fs.write' },
          ].map(({ ok, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={cn('text-[0.6rem] font-semibold', ok ? 'text-emerald-500' : 'text-red-400')}>
                {ok ? '✓' : '✗'}
              </span>
              <span className={cn('font-mono text-[0.68rem]', ok ? 'text-muted/70' : 'text-muted/50')}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Connector */}
      <div className="flex justify-center">
        <div {...connector(DELAYS.connector2)} data-visible={vis} className="h-6 w-px bg-line-strong" />
      </div>

      {/* Condition */}
      <div {...fade(DELAYS.condition)} data-visible={vis} className="flex justify-center">
        <div className="rounded-full border border-line-strong bg-bg px-4 py-1.5 shadow-sm">
          <span className="font-mono text-[0.72rem] text-muted">
            condition: score <span className="text-kb-text/70">≥ 7</span> ?
          </span>
        </div>
      </div>

      {/* Branch split — overflow-x-auto prevents horizontal scroll on narrow screens */}
      <div className="relative mt-0 overflow-x-auto">
        <div className="flex justify-center">
          <div className="relative flex w-3/4 min-w-[240px] justify-between">
            {/* Horizontal line */}
            <div
              {...hline(DELAYS.branch)}
              data-visible={vis}
              className="absolute top-0 h-px bg-line-strong"
              style={{ left: '0', right: '0', '--anim-delay': `${DELAYS.branch}ms` } as React.CSSProperties}
            />
            {/* Vertical drops */}
            <div {...connector(DELAYS.branchDrop)} data-visible={vis} className="h-5 w-px bg-line-strong" />
            <div {...connector(DELAYS.branchDrop)} data-visible={vis} className="h-5 w-px bg-line-strong" />
          </div>
        </div>

        <div className="flex gap-3 pt-0 min-w-[240px]">
          <div {...step(DELAYS.leafLeft)} data-visible={vis} className="flex-1 rounded-xl border border-amber-200/60 bg-amber-50/20 px-3 py-2.5 shadow-sm dark:border-amber-900/30 dark:bg-amber-950/10">
            <div className="mb-1.5 font-mono text-[0.6rem] text-amber-600/70">score &lt; 7</div>
            <div className="font-mono text-sm font-semibold text-kb-text">request-changes</div>
            <div className="mt-0.5 font-mono text-[0.68rem] text-muted/60">github.comment</div>
          </div>
          <div {...step(DELAYS.leafRight)} data-visible={vis} className="flex-1 rounded-xl border border-emerald-200/60 bg-emerald-50/20 px-3 py-2.5 shadow-sm dark:border-emerald-900/30 dark:bg-emerald-950/10">
            <div className="mb-1.5 font-mono text-[0.6rem] text-emerald-600/70">score ≥ 7</div>
            <div className="font-mono text-sm font-semibold text-kb-text">approve</div>
            <div className="mt-0.5 font-mono text-[0.68rem] text-muted/60">github.approve</div>
          </div>
        </div>
      </div>
    </div>
  );
}
