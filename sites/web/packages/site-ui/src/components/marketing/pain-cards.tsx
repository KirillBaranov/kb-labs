import * as React from 'react';
import { cn } from '../../lib/utils';

/* ── Infographics ─────────────────────────────────────────── */

function AgentGraphic() {
  const perms = [
    { ok: true,  label: 'github.api' },
    { ok: false, label: 'shell.exec' },
    { ok: true,  label: 'git.read' },
    { ok: false, label: 'fs.write' },
    { ok: true,  label: 'github.comment' },
    { ok: false, label: 'network.*' },
  ];
  return (
    <div className="w-full max-w-sm rounded-xl border border-accent/20 bg-surface p-5 select-none shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/20">
          agent
        </span>
        <span className="font-mono text-[0.75rem] font-semibold text-kb-text">code-reviewer</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {perms.map(({ ok, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn('text-[0.62rem] font-bold', ok ? 'text-emerald-500' : 'text-red-400')}>
              {ok ? '✓' : '✗'}
            </span>
            <span className={cn('font-mono text-[0.68rem]', ok ? 'text-muted/80' : 'text-muted/50 dark:text-muted/35 line-through')}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowGraphic() {
  const steps = [
    { id: 'fetch',  ms: '0.3s', done: true },
    { id: 'review', ms: '2.1s', done: true },
    { id: 'notify', running: true },
  ];
  return (
    <div className="w-full max-w-sm select-none space-y-3">
      <div className="font-mono text-[0.65rem] text-muted/50">trigger: pull_request.opened</div>
      <div className="flex items-stretch gap-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.id}>
            <div className={cn(
              'flex-1 rounded-xl border px-3 py-3 shadow-sm',
              step.running ? 'border-accent/30 bg-accent/[0.05]' : 'border-line bg-surface',
            )}>
              <div className="font-mono text-[0.72rem] font-semibold text-kb-text">{step.id}</div>
              {step.done && <div className="mt-1 font-mono text-[0.63rem] text-emerald-500/80">✓ {step.ms}</div>}
              {step.running && <div className="mt-1 font-mono text-[0.63rem] text-accent/70">running…</div>}
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center">
                <div className="h-px w-3 bg-line-strong" />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function LLMGraphic() {
  return (
    <div className="w-full select-none flex items-center justify-center gap-2 overflow-visible">
      {/* Plugin */}
      <div className="flex-shrink-0 rounded-xl border border-accent/20 bg-surface px-3 py-3 shadow-sm">
        <div className="mb-1.5 font-mono text-[0.58rem] text-muted/50">my-plugin</div>
        <div className="font-mono text-[0.65rem] text-kb-text leading-relaxed">
          platform.llm<br />
          <span className="text-accent/80">.complete(prompt)</span>
        </div>
      </div>

      <div className="h-px w-4 flex-shrink-0 bg-line-strong" />

      {/* Adapter */}
      <div className="flex-shrink-0 rounded-xl border border-line-strong bg-surface dark:bg-bg px-3 py-3 shadow-sm text-center">
        <div className="font-mono text-[0.63rem] font-semibold text-muted">adapter</div>
        <div className="mt-1.5 flex flex-col gap-1">
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[0.55rem] text-emerald-600/80">openai</span>
          <span className="rounded bg-line/40 px-1.5 py-0.5 font-mono text-[0.55rem] text-muted/50 line-through ring-1 ring-inset ring-line">claude</span>
          <span className="rounded bg-line/40 px-1.5 py-0.5 font-mono text-[0.55rem] text-muted/50 line-through ring-1 ring-inset ring-line">mistral</span>
        </div>
      </div>

      <div className="h-px w-4 flex-shrink-0 bg-line-strong" />

      {/* Response */}
      <div className="flex-shrink-0 rounded-xl border border-line bg-surface px-3 py-3 shadow-sm">
        <div className="mb-1.5 font-mono text-[0.58rem] text-muted/50">response</div>
        <div className="font-mono text-[0.65rem] text-emerald-500/80">✓ LLMResponse</div>
        <div className="mt-1 font-mono text-[0.58rem] text-muted/50">same interface</div>
      </div>
    </div>
  );
}

function PlatformGraphic() {
  const workflows = [
    { name: 'code-review.yaml', ms: '3.1s', done: true },
    { name: 'release.yaml',     ms: '12s',  done: true },
    { name: 'deploy.yaml',      running: true },
    { name: 'commit.yaml',      ms: '0.8s', done: true },
  ];
  return (
    <div className="w-full max-w-sm select-none overflow-hidden rounded-xl border border-line bg-surface shadow-sm divide-y divide-line">
      {workflows.map((wf) => (
        <div key={wf.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              'h-1.5 w-1.5 flex-shrink-0 rounded-full',
              wf.done ? 'bg-emerald-500/70' : 'bg-accent/70',
            )} />
            <span className="font-mono text-[0.68rem] text-muted/80 truncate">{wf.name}</span>
          </div>
          {wf.done && <span className="flex-shrink-0 font-mono text-[0.63rem] text-emerald-500/80">✓ {wf.ms}</span>}
          {wf.running && <span className="flex-shrink-0 font-mono text-[0.63rem] text-accent/70">running…</span>}
        </div>
      ))}
    </div>
  );
}

/* ── Pain rows ────────────────────────────────────────────── */

const GRAPHICS = [
  <AgentGraphic />,
  <WorkflowGraphic />,
  <LLMGraphic />,
  <PlatformGraphic />,
];

export interface PainItem {
  title: string;
  description: string;
}

export interface PainCardsProps {
  items?: PainItem[];
}

const DEFAULT_ITEMS: PainItem[] = [];

export function PainCards({ items = DEFAULT_ITEMS }: PainCardsProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      {items.map((pain, i) => (
        <div
          key={pain.title}
          className={cn(
            'grid grid-cols-1 md:grid-cols-[1fr_1.2fr]',
            i < items.length - 1 && 'border-b border-line',
          )}
        >
          {/* Text */}
          <div className="flex flex-col justify-center gap-2 p-8 bg-surface">
            <h3 className="text-[1.05rem] font-bold leading-snug text-kb-text">{pain.title}</h3>
            <p className="text-[0.88rem] leading-relaxed text-muted">{pain.description}</p>
          </div>

          {/* Visual */}
          <div className="flex items-center justify-center border-t border-line bg-bg p-8 md:border-l md:border-t-0">
            {GRAPHICS[i]}
          </div>
        </div>
      ))}
    </div>
  );
}
