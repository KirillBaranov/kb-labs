'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface TerminalBlockProps {
  commands: string[];
  prompt?: string;
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  bare?: boolean;
}

interface TerminalState {
  completedLines: string[];
  currentText: string;
  commandIndex: number;
  charIndex: number;
  phase: 'typing' | 'pausing' | 'done';
}

export function TerminalBlock({
  commands,
  prompt = '$',
  className,
  autoPlay = true,
  loop = false,
  bare = false,
}: TerminalBlockProps) {
  const [state, setState] = React.useState<TerminalState>({
    completedLines: [],
    currentText: '',
    commandIndex: 0,
    charIndex: 0,
    phase: 'typing',
  });

  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = React.useRef(true);
  const visibleRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting; },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => {
      mountedRef.current = false;
      observer.disconnect();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!autoPlay || commands.length === 0) return;

    function tick() {
      if (!mountedRef.current || !visibleRef.current) {
        timeoutRef.current = setTimeout(tick, 200);
        return;
      }

      setState((prev) => {
        if (prev.phase === 'done') {
          if (loop) {
            return {
              completedLines: [],
              currentText: '',
              commandIndex: 0,
              charIndex: 0,
              phase: 'typing',
            };
          }
          return prev;
        }

        const cmd = commands[prev.commandIndex];

        if (prev.phase === 'pausing') {
          const nextIndex = prev.commandIndex + 1;
          if (nextIndex >= commands.length) {
            return {
              ...prev,
              phase: loop ? 'typing' : 'done',
              completedLines: [...prev.completedLines, cmd],
              currentText: '',
              commandIndex: loop ? 0 : prev.commandIndex,
              charIndex: 0,
            };
          }
          return {
            ...prev,
            completedLines: [...prev.completedLines, cmd],
            currentText: '',
            commandIndex: nextIndex,
            charIndex: 0,
            phase: 'typing',
          };
        }

        // typing phase
        if (prev.charIndex < cmd.length) {
          return {
            ...prev,
            currentText: cmd.slice(0, prev.charIndex + 1),
            charIndex: prev.charIndex + 1,
          };
        }

        // finished typing current command
        return { ...prev, phase: 'pausing' };
      });
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const delay = state.phase === 'pausing' ? 800 : state.phase === 'done' ? 0 : 40;

    if (state.phase === 'done' && !loop) return;

    timeoutRef.current = setTimeout(tick, delay);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, autoPlay, loop, commands]);

  const body = (
    <div className="bg-[#0d0e11] text-[#e8eaf0] font-mono text-sm p-4 min-h-[120px]">
      {state.completedLines.map((line, i) => (
        <div key={i} className="text-[#8890a0] mb-1">
          <span className="text-[#5a6070] mr-2">{prompt}</span>
          {line}
        </div>
      ))}
      {state.phase !== 'done' && (
        <div className="flex items-center">
          <span className="text-[#5a6070] mr-2">{prompt}</span>
          <span>{state.currentText}</span>
          <span className="animate-pulse ml-0.5">_</span>
        </div>
      )}
    </div>
  );

  if (bare) {
    return (
      <div ref={containerRef} className={cn('w-full', className)}>
        {body}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('rounded-xl border border-line overflow-hidden shadow-card-lg', className)}>
      {/* Title bar */}
      <div className="bg-surface border-b border-line px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-sm text-muted font-mono mx-auto">Terminal</span>
      </div>
      {body}
    </div>
  );
}
