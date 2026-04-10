'use client';

import { useEffect, useRef } from 'react';
import type { OutputLine } from './presets';
import s from './WorkflowDemo.module.css';

type StepType = 'shell' | 'gate' | 'approval';

interface OutputPanelProps {
  stepName: string | null;
  stepType: StepType | null;
  lines: OutputLine[];
  visibleCount: number;
  isStreaming: boolean;
  approvalContext?: string;
}

export function OutputPanel({ stepName, stepType, lines, visibleCount, isStreaming, approvalContext }: OutputPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [visibleCount]);

  const visibleLines = lines.slice(0, visibleCount);

  if (!stepName) {
    return (
      <div className={s.outputPanel}>
        <div className={s.outputHeader}>
          <span className={s.outputTitle}>Output</span>
        </div>
        <div className={`${s.outputBody} ${s.outputPlaceholder}`} ref={bodyRef}>
          <span className={s.placeholderText}>Select a task and run the pipeline to see output here</span>
        </div>
      </div>
    );
  }

  return (
    <div className={s.outputPanel}>
      <div className={s.outputHeader}>
        <span className={s.outputTitle}>{stepName}</span>
        {stepType && (
          <span className={`${s.typeBadge} ${s[`type_${stepType}`]}`}>{stepType}</span>
        )}
        {isStreaming && <span className={s.outputDot} />}
        {!isStreaming && visibleCount > 0 && <span className={s.outputDone}>&#10003;</span>}
      </div>
      <div className={s.outputBody} ref={bodyRef}>
        {visibleLines.map((line, i) => {
          if (line.type === 'blank') {
            return <div key={i} className={s.outputBlank} />;
          }
          return (
            <div key={i} className={`${s.outputLine} ${s[`line_${line.type}`]}`}>
              {line.type === 'diff-add' && <span className={s.diffPrefix}>+</span>}
              {line.type === 'diff-del' && <span className={s.diffPrefix}>-</span>}
              {line.type === 'success' && !line.text.startsWith('✓') && !line.text.startsWith('[') && <span className={s.lineIcon}>✓ </span>}
              {line.type === 'error' && <span className={s.lineIcon}>✗ </span>}
              <span>{line.text}</span>
            </div>
          );
        })}
        {isStreaming && <span className={s.cursor}>_</span>}
        {approvalContext && !isStreaming && (
          <div className={s.approvalContextBlock}>
            {approvalContext.split('\n').map((line, i) => {
              // Simple markdown-ish rendering
              if (line.startsWith('**') && line.includes('**:')) {
                const [label, ...rest] = line.split('**:');
                const cleanLabel = label.replace(/^\*\*/, '');
                return (
                  <div key={i} className={s.contextLine}>
                    <strong>{cleanLabel}:</strong>{rest.join('**:')}
                  </div>
                );
              }
              if (line.startsWith('- ')) {
                return <div key={i} className={s.contextBullet}>{line}</div>;
              }
              if (line.trim() === '') {
                return <div key={i} className={s.outputBlank} />;
              }
              return <div key={i} className={s.contextLine}>{line}</div>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
