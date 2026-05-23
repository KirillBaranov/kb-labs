import * as React from 'react';
import { cn } from '../../lib/utils';

export interface MockupFrameProps {
  type?: 'browser' | 'terminal';
  url?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

function TrafficLights() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

export function MockupFrame({
  type = 'browser',
  url,
  title = 'Terminal',
  children,
  className,
}: MockupFrameProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line-strong overflow-hidden shadow-card-lg',
        className
      )}
    >
      {type === 'browser' ? (
        <>
          <div className="bg-chrome border-b border-line px-4 py-3 flex items-center gap-3">
            <TrafficLights />
            <div className="flex-1 flex justify-center">
              <div className="bg-bg rounded-md px-3 py-1 text-xs text-muted font-mono text-center max-w-[280px] w-full truncate">
                {url ?? 'localhost:3000'}
              </div>
            </div>
            <div className="w-[46px]" />
          </div>
          <div>{children}</div>
        </>
      ) : (
        <>
          <div className="bg-chrome border-b border-line px-4 py-3 flex items-center gap-3">
            <TrafficLights />
            <span className="text-xs text-muted mx-auto">{title}</span>
          </div>
          <div className="bg-[#0d0e11]">{children}</div>
        </>
      )}
    </div>
  );
}
