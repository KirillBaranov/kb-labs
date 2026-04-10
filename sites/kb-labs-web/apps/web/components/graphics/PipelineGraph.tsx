'use client';

import { useEffect, useRef, useState } from 'react';
import s from './PipelineGraph.module.css';

/*
 * Decorative SVG pipeline visualization.
 * Shows: Plan → Implement → Review (↺ rework) → Build & QA → ✓ Commit
 * Animates on scroll via IntersectionObserver.
 */

const NODES = [
  { id: 'plan', label: 'Plan', sub: 'AI agent builds plan', type: 'shell', color: '#0c66ff' },
  { id: 'implement', label: 'Implement', sub: 'Execute approved plan', type: 'shell', color: '#0c66ff' },
  { id: 'review', label: 'Code Review', sub: 'AI-powered review', type: 'gate', color: '#f59e0b' },
  { id: 'qa', label: 'Build & QA', sub: 'Type check + tests', type: 'shell', color: '#0c66ff' },
  { id: 'commit', label: 'Commit', sub: 'Conventional commits', type: 'approval', color: '#16a34a' },
];

const NODE_SPACING = 72;
const START_Y = 32;
const CX = 24; // center X for nodes
const LABEL_X = 52; // text X offset

const TYPE_COLORS: Record<string, { fill: string; text: string }> = {
  shell: { fill: '#f0f4ff', text: '#3b7afe' },
  gate: { fill: '#fdf4e8', text: '#b45309' },
  approval: { fill: '#f0fdf4', text: '#16a34a' },
};

export function PipelineGraph() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalHeight = START_Y + (NODES.length - 1) * NODE_SPACING + 40;

  return (
    <div ref={ref} className={`${s.graph} ${visible ? s.visible : ''}`}>
      <svg viewBox={`0 0 260 ${totalHeight}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Connection lines */}
        {NODES.slice(0, -1).map((node, i) => {
          const y1 = START_Y + i * NODE_SPACING + 10;
          const y2 = START_Y + (i + 1) * NODE_SPACING - 10;
          return (
            <line
              key={`line-${node.id}`}
              className={s.line}
              x1={CX}
              y1={y1}
              x2={CX}
              y2={y2}
              stroke="#d9dde6"
              strokeWidth="2"
              strokeDasharray={`${y2 - y1}`}
              strokeDashoffset={`${y2 - y1}`}
              style={{ animationDelay: `${300 + i * 300}ms` }}
            />
          );
        })}

        {/* Rework loop arrow (from Review back) */}
        <path
          className={s.loop}
          d={`M ${CX + 10} ${START_Y + 2 * NODE_SPACING} Q ${CX + 40} ${START_Y + 2 * NODE_SPACING - 20} ${CX + 40} ${START_Y + 1.5 * NODE_SPACING} Q ${CX + 40} ${START_Y + NODE_SPACING + 10} ${CX + 10} ${START_Y + NODE_SPACING}`}
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeDasharray="120"
          strokeDashoffset="120"
          fill="none"
          markerEnd="url(#arrowhead)"
        />

        {/* Arrow marker */}
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6" fill="#f59e0b" />
          </marker>
        </defs>

        {/* Rework label */}
        <text
          className={s.sublabel}
          x={CX + 46}
          y={START_Y + 1.75 * NODE_SPACING + 4}
          style={{ animationDelay: '1000ms', fontSize: '10px', fill: '#f59e0b' }}
        >
          rework
        </text>

        {/* Nodes */}
        {NODES.map((node, i) => {
          const cy = START_Y + i * NODE_SPACING;
          const isLast = i === NODES.length - 1;
          const tc = TYPE_COLORS[node.type];

          return (
            <g
              key={node.id}
              className={s.node}
              style={{ animationDelay: `${200 + i * 300}ms` }}
            >
              {/* Pulse ring for last node */}
              {isLast && (
                <circle
                  className={s.checkPulse}
                  cx={CX}
                  cy={cy}
                  r={18}
                  fill="#16a34a"
                  opacity={0.15}
                />
              )}

              {/* Node circle */}
              <circle
                cx={CX}
                cy={cy}
                r={isLast ? 12 : 10}
                fill={isLast ? '#16a34a' : '#fff'}
                stroke={isLast ? '#16a34a' : node.color}
                strokeWidth={isLast ? 0 : 2}
              />

              {/* Checkmark for last node */}
              {isLast && (
                <path
                  d={`M ${CX - 4} ${cy} L ${CX - 1} ${cy + 3} L ${CX + 5} ${cy - 3}`}
                  stroke="#fff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              )}

              {/* Inner dot for non-last nodes */}
              {!isLast && (
                <circle
                  cx={CX}
                  cy={cy}
                  r={3}
                  fill={node.color}
                />
              )}

              {/* Label */}
              <text
                className={s.label}
                x={LABEL_X}
                y={cy + 1}
                dominantBaseline="middle"
                style={{ animationDelay: `${300 + i * 300}ms` }}
              >
                {node.label}
              </text>

              {/* Type badge */}
              <rect
                x={LABEL_X + node.label.length * 7.5 + 8}
                y={cy - 8}
                width={node.type.length * 6.5 + 10}
                height={16}
                rx={3}
                fill={tc.fill}
                className={s.badge}
                style={{ animationDelay: `${350 + i * 300}ms` }}
              />
              <text
                className={s.badge}
                x={LABEL_X + node.label.length * 7.5 + 13}
                y={cy + 1}
                dominantBaseline="middle"
                fill={tc.text}
                style={{ animationDelay: `${350 + i * 300}ms` }}
              >
                {node.type}
              </text>

              {/* Sub-label */}
              <text
                className={s.sublabel}
                x={LABEL_X}
                y={cy + 17}
                style={{ animationDelay: `${350 + i * 300}ms` }}
              >
                {node.sub}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
