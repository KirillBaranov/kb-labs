'use client';

import { useEffect, useRef, useState } from 'react';

import s from './WorkflowRunCard.module.css';

type StepStatus = 'done' | 'active' | 'queued';

const STEPS: Array<{
  id: string;
  label: string;
  sub: string;
  type: 'shell' | 'gate' | 'approval';
  status: StepStatus;
  time?: string;
}> = [
  { id: 'plan', label: 'Plan', sub: 'AI agent builds plan', type: 'shell', status: 'done', time: '2.3s' },
  { id: 'implement', label: 'Implement', sub: 'Execute approved plan', type: 'shell', status: 'done', time: '48s' },
  { id: 'review', label: 'Code Review', sub: '3 suggestions applied', type: 'gate', status: 'active' },
  { id: 'qa', label: 'Build & QA', sub: 'Type check + tests', type: 'shell', status: 'queued' },
  { id: 'commit', label: 'Commit', sub: 'Conventional commits', type: 'approval', status: 'queued' },
];

export function WorkflowRunCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${s.card} ${visible ? s.visible : ''}`}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.titleGroup}>
          <span className={s.workflowName}>dev-cycle</span>
          <span className={s.taskName}>fix auth token expiry</span>
        </div>
        <span className={s.statusBadge}>
          <span className={s.statusDot} />
          running
        </span>
      </div>

      {/* Steps */}
      <div className={s.steps}>
        {STEPS.map((step, i) => (
          <div
            key={step.id}
            className={`${s.step} ${s[`step_${step.status}`]}`}
            style={{ '--step-delay': `${i * 90}ms` } as React.CSSProperties}
          >
            {/* Status icon */}
            <span className={s.stepIcon}>
              {step.status === 'done' && <CheckIcon />}
              {step.status === 'active' && <span className={s.activeDot} />}
              {step.status === 'queued' && <CircleIcon />}
            </span>

            {/* Label + type badge */}
            <span className={s.stepLabel}>{step.label}</span>
            <span className={`${s.stepType} ${s[`type_${step.type}`]}`}>{step.type}</span>

            {/* Sub-text — hidden on narrow */}
            <span className={s.stepSub}>{step.sub}</span>

            {/* Time */}
            {step.time ? (
              <span className={s.stepTime}>{step.time}</span>
            ) : (
              <span className={s.stepTimePlaceholder} />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className={s.footer}>
        <span className={s.footerStat}>
          <ClockIcon />
          52s elapsed
        </span>
        <span className={s.footerDivider} />
        <span className={s.footerStat}>3 suggestions applied</span>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 7l1.8 1.8L9.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="6.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 3.5V6l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
