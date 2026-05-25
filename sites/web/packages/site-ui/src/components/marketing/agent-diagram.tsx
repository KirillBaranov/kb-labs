import * as React from 'react';
import { cn } from '../../lib/utils';

export interface AgentDiagramProps {
  className?: string;
}

export function AgentDiagram({ className }: AgentDiagramProps) {
  return (
    <div className={cn('w-full select-none space-y-2', className)}>

      {/* Agent box */}
      <div className="rounded-xl border border-line bg-surface px-4 py-3.5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-accent/10 px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/20">
            agent
          </span>
          <span className="font-mono text-[0.72rem] font-semibold text-kb-text">claude-sonnet-4-6</span>
        </div>

        {/* Commands the agent calls */}
        <div className="space-y-1.5">
          {[
            { cmd: 'kb github create-pr', arg: '"fix: rate limiting"' },
            { cmd: 'kb github comment',   arg: '"LGTM, merging"' },
            { cmd: 'kb slack notify',     arg: '"deployed to prod"' },
          ].map(({ cmd, arg }) => (
            <div key={cmd} className="flex items-baseline gap-1.5 font-mono text-[0.68rem]">
              <span className="text-muted/40">$</span>
              <span className="text-accent/80">{cmd}</span>
              <span className="text-muted/50">{arg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Connector */}
      <div className="flex justify-center">
        <div className="flex flex-col items-center gap-0.5">
          <div className="h-4 w-px bg-line-strong" />
          <span className="font-mono text-[0.65rem] text-muted/55 dark:text-muted/40">plugin commands</span>
          <div className="h-4 w-px bg-line-strong" />
        </div>
      </div>

      {/* Plugin box */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-bg px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-muted/50 ring-1 ring-inset ring-line">
              plugin
            </span>
            <span className="font-mono text-[0.72rem] font-semibold text-kb-text">github-plugin</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {/* Key */}
          <div className="col-span-2 mb-1 flex items-center gap-1.5 rounded-md bg-white/70 px-2.5 py-1.5 font-mono text-[0.63rem] dark:bg-white/5">
            <span aria-hidden="true">🔑</span>
            <span className="text-muted/50">key:</span>
            <span className="text-muted/70">ghp_xxx</span>
            <span className="ml-auto text-emerald-600/80 dark:text-emerald-500/70 text-[0.65rem]">stored in plugin</span>
          </div>

          {/* Permissions */}
          {[
            { ok: true,  label: 'createPR' },
            { ok: false, label: 'deleteRepo' },
            { ok: true,  label: 'addComment' },
            { ok: false, label: 'adminAccess' },
          ].map(({ ok, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={cn('text-[0.6rem] font-bold', ok ? 'text-emerald-500' : 'text-red-400')}>
                {ok ? '✓' : '✗'}
              </span>
              <span className={cn('font-mono text-[0.63rem]', ok ? 'text-muted/80' : 'text-muted/35 line-through')}>
                {label}
              </span>
            </div>
          ))}

          {/* Trace */}
          <div className="col-span-2 mt-1 flex items-center gap-1.5 font-mono text-[0.6rem] text-muted/50">
            <span className="text-emerald-500/60">●</span>
            every call traced · analytics counted
          </div>
        </div>
      </div>

      {/* Connector to external */}
      <div className="flex justify-center">
        <div className="h-4 w-px bg-line-strong" />
      </div>

      {/* External API */}
      <div className="flex justify-center">
        <div className="rounded-full border border-line bg-bg px-4 py-1.5">
          <span className="font-mono text-[0.65rem] text-muted/60">api.github.com</span>
        </div>
      </div>

    </div>
  );
}
