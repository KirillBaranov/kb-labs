'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface WorkflowLiveGraphProps {
  className?: string;
}

// ── Layout ─────────────────────────────────────────────────────────────────

const VW = 440;
const VH = 500;

type NodeId = 'trigger' | 'fetch' | 'tests' | 'review' | 'gate' | 'approve' | 'changes';
type NodeKind = 'trigger' | 'step' | 'agent' | 'gate' | 'outcome';
type NodeState = 'idle' | 'running' | 'done' | 'skipped';

interface NodeDef {
  cx: number;
  cy: number;
  label: string;
  sub?: string;
  kind: NodeKind;
}

const NODES: Record<NodeId, NodeDef> = {
  trigger: { cx: 220, cy: 36,  label: 'pull_request.opened', kind: 'trigger' },
  fetch:   { cx: 220, cy: 122, label: 'fetch-diff',          sub: 'builtin:shell',  kind: 'step'    },
  tests:   { cx: 90,  cy: 242, label: 'run-tests',           sub: 'builtin:shell',  kind: 'step'    },
  review:  { cx: 350, cy: 242, label: 'ai-review',           sub: 'claude-sonnet',  kind: 'agent'   },
  gate:    { cx: 220, cy: 352, label: 'score ≥ 7',           kind: 'gate'   },
  approve: { cx: 350, cy: 458, label: 'approve',             sub: 'github.approve', kind: 'outcome' },
  changes: { cx: 90,  cy: 458, label: 'req-changes',         sub: 'github.comment', kind: 'outcome' },
};

const NW = 128;
const NH = 36;
const GATE_R = 26;
const TRIG_W = 160;
const TRIG_H = 26;

function outPort(id: NodeId, toId?: NodeId): [number, number] {
  const { cx, cy } = NODES[id];
  if (id === 'trigger') return [cx, cy + TRIG_H / 2];
  if (id === 'gate') {
    const tx = toId ? NODES[toId].cx : cx;
    return tx < cx ? [cx - GATE_R, cy] : [cx + GATE_R, cy];
  }
  return [cx, cy + NH / 2];
}

function inPort(id: NodeId): [number, number] {
  const { cx, cy } = NODES[id];
  if (id === 'trigger') return [cx, cy - TRIG_H / 2];
  if (id === 'gate') return [cx, cy - GATE_R];
  return [cx, cy - NH / 2];
}

function edgePath(from: NodeId, to: NodeId): string {
  const [x1, y1] = outPort(from, to);
  const [x2, y2] = inPort(to);
  if (Math.abs(x1 - x2) < 4) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mid = y1 + (y2 - y1) * 0.55;
  return `M ${x1} ${y1} C ${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
}

// Loopback arc: from changes (left side) curving around to fetch (input port)
// Goes LEFT of the diagram so it's visually distinct
const LOOPBACK_PATH = (() => {
  const [x1, y1] = [NODES.changes.cx - NW / 2, NODES.changes.cy]; // left edge of changes
  const [x2, y2] = inPort('fetch');
  // Arc hugs the left side of the diagram
  return `M ${x1} ${y1} C ${x1 - 55} ${y1} ${x2 - 55} ${y2} ${x2} ${y2}`;
})();

const EDGE_PAIRS: Array<[NodeId, NodeId]> = [
  ['trigger', 'fetch'],
  ['fetch',   'tests'],
  ['fetch',   'review'],
  ['tests',   'gate'],
  ['review',  'gate'],
  ['gate',    'approve'],
  ['gate',    'changes'],
];

// ── Animation timeline ──────────────────────────────────────────────────────

type TimelineEv =
  | { t: number; kind: 'node'; id: NodeId; state: NodeState }
  | { t: number; kind: 'token'; from: NodeId; to: NodeId; dur: number; loopback?: true }
  | { t: number; kind: 'iter'; n: number }
  | { t: number; kind: 'reset' };

// Iter 1: gate → changes (score < 7) → loopback → fetch → … → gate → approve
const TIMELINE: TimelineEv[] = [
  // ── Iteration 1 ─────────────────────────────────────────────────
  { t: 0,    kind: 'iter', n: 1 },
  { t: 0,    kind: 'node', id: 'trigger', state: 'running' },
  { t: 450,  kind: 'node', id: 'trigger', state: 'done'    },
  { t: 450,  kind: 'token', from: 'trigger', to: 'fetch',  dur: 420 },
  { t: 870,  kind: 'node', id: 'fetch',   state: 'running' },
  { t: 1750, kind: 'node', id: 'fetch',   state: 'done'    },
  { t: 1750, kind: 'token', from: 'fetch', to: 'tests',    dur: 480 },
  { t: 1750, kind: 'token', from: 'fetch', to: 'review',   dur: 480 },
  { t: 2230, kind: 'node', id: 'tests',   state: 'running' },
  { t: 2230, kind: 'node', id: 'review',  state: 'running' },
  { t: 3100, kind: 'node', id: 'tests',   state: 'done'    },
  { t: 3100, kind: 'token', from: 'tests',  to: 'gate',    dur: 480 },
  { t: 4600, kind: 'node', id: 'review',  state: 'done'    },
  { t: 4600, kind: 'token', from: 'review', to: 'gate',    dur: 480 },
  { t: 5200, kind: 'node', id: 'gate',    state: 'running' },
  { t: 5750, kind: 'node', id: 'gate',    state: 'done'    },
  // Gate routes to changes (score < 7)
  { t: 5750, kind: 'node', id: 'approve', state: 'skipped' },
  { t: 5750, kind: 'token', from: 'gate',  to: 'changes',  dur: 500 },
  { t: 6250, kind: 'node', id: 'changes', state: 'running' },
  { t: 6800, kind: 'node', id: 'changes', state: 'done'    },

  // ── Loopback ────────────────────────────────────────────────────
  { t: 6800, kind: 'token', from: 'changes', to: 'fetch',  dur: 900, loopback: true },

  // ── Iteration 2 (faster) ─────────────────────────────────────────
  { t: 7700, kind: 'iter', n: 2 },
  // Reset non-terminal nodes for second run
  { t: 7700, kind: 'node', id: 'fetch',   state: 'running' },
  { t: 7700, kind: 'node', id: 'tests',   state: 'idle'    },
  { t: 7700, kind: 'node', id: 'review',  state: 'idle'    },
  { t: 7700, kind: 'node', id: 'gate',    state: 'idle'    },
  { t: 7700, kind: 'node', id: 'approve', state: 'idle'    },
  { t: 8350, kind: 'node', id: 'fetch',   state: 'done'    },
  { t: 8350, kind: 'token', from: 'fetch', to: 'tests',    dur: 380 },
  { t: 8350, kind: 'token', from: 'fetch', to: 'review',   dur: 380 },
  { t: 8730, kind: 'node', id: 'tests',   state: 'running' },
  { t: 8730, kind: 'node', id: 'review',  state: 'running' },
  { t: 9400, kind: 'node', id: 'tests',   state: 'done'    },
  { t: 9400, kind: 'token', from: 'tests',  to: 'gate',    dur: 380 },
  { t: 10500,kind: 'node', id: 'review',  state: 'done'    },
  { t: 10500,kind: 'token', from: 'review', to: 'gate',    dur: 380 },
  { t: 11000,kind: 'node', id: 'gate',    state: 'running' },
  { t: 11500,kind: 'node', id: 'gate',    state: 'done'    },
  // Gate routes to approve (score ≥ 7)
  { t: 11500,kind: 'node', id: 'changes', state: 'skipped' },
  { t: 11500,kind: 'token', from: 'gate',  to: 'approve',  dur: 420 },
  { t: 11920,kind: 'node', id: 'approve', state: 'running' },
  { t: 12600,kind: 'node', id: 'approve', state: 'done'    },

  { t: 15000, kind: 'reset' },
];

// ── State ───────────────────────────────────────────────────────────────────

interface TokenAnim {
  id: number;
  from: NodeId;
  to: NodeId;
  dur: number;
  loopback?: true;
}

const IDLE_NODES: Record<NodeId, NodeState> = {
  trigger: 'idle', fetch: 'idle', tests: 'idle',
  review: 'idle', gate: 'idle', approve: 'idle', changes: 'idle',
};

let _tid = 0;

// ── Component ───────────────────────────────────────────────────────────────

export function WorkflowLiveGraph({ className }: WorkflowLiveGraphProps) {
  const [nodeStates, setNodeStates] = React.useState<Record<NodeId, NodeState>>(IDLE_NODES);
  const [tokens, setTokens] = React.useState<TokenAnim[]>([]);
  const [iteration, setIteration] = React.useState(0);

  const rootRef    = React.useRef<HTMLDivElement>(null);
  const timers     = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasStarted = React.useRef(false);

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const runAnimation = React.useCallback(() => {
    clearTimers();
    setNodeStates({ ...IDLE_NODES });
    setTokens([]);
    setIteration(0);

    TIMELINE.forEach((ev) => {
      const id = setTimeout(() => {
        if (ev.kind === 'node') {
          setNodeStates((prev) => ({ ...prev, [ev.id]: ev.state }));
        } else if (ev.kind === 'iter') {
          setIteration(ev.n);
        } else if (ev.kind === 'token') {
          const tokId = _tid++;
          setTokens((prev) => [...prev, { id: tokId, from: ev.from, to: ev.to, dur: ev.dur, loopback: ev.loopback }]);
          const rmId = setTimeout(() => {
            setTokens((prev) => prev.filter((t) => t.id !== tokId));
          }, ev.dur + 100);
          timers.current.push(rmId);
        } else {
          hasStarted.current = false;
          const restartId = setTimeout(() => {
            hasStarted.current = true;
            runAnimation();
          }, 600);
          timers.current.push(restartId);
        }
      }, ev.t);
      timers.current.push(id);
    });
  }, [clearTimers]);

  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          runAnimation();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimers();
    };
  }, [runAnimation, clearTimers]);

  // ── Visual helpers ───────────────────────────────────────────────────────

  function nodeFill(state: NodeState, kind: NodeKind): string {
    if (state === 'running') return kind === 'agent' ? 'rgba(58,130,246,0.10)' : 'rgba(58,130,246,0.06)';
    if (state === 'done')    return 'rgba(52,211,153,0.07)';
    if (state === 'skipped') return 'rgba(0,0,0,0)';
    return kind === 'agent' ? 'rgba(58,130,246,0.03)' : 'rgb(var(--color-surface))';
  }

  function nodeStroke(state: NodeState, kind: NodeKind): string {
    if (state === 'running') return 'rgba(58,130,246,0.45)';
    if (state === 'done')    return 'rgba(52,211,153,0.40)';
    if (state === 'skipped') return 'rgba(128,144,166,0.15)';
    return kind === 'agent' ? 'rgba(58,130,246,0.20)' : 'rgb(var(--color-line))';
  }

  function nodeLabelColor(state: NodeState, kind: NodeKind): string {
    if (state === 'skipped') return 'rgba(128,144,166,0.30)';
    if (state === 'done')    return 'rgba(52,211,153,0.85)';
    if (state === 'running') return 'rgb(var(--color-accent))';
    return kind === 'agent' ? 'rgba(58,130,246,0.75)' : 'rgb(var(--color-text))';
  }

  function subColor(state: NodeState): string {
    if (state === 'skipped') return 'rgba(128,144,166,0.20)';
    return 'rgba(128,144,166,0.55)';
  }

  function edgeStroke(from: NodeId, to: NodeId): string {
    const dest = nodeStates[to];
    const src  = nodeStates[from];
    if (to === 'changes' && dest === 'skipped') return 'rgba(128,144,166,0.10)';
    if (to === 'approve' && dest === 'skipped') return 'rgba(128,144,166,0.10)';
    if (dest === 'running' || src === 'done') return 'rgba(128,144,166,0.35)';
    return 'rgba(128,144,166,0.18)';
  }

  function gateDiamond(cx: number, cy: number): string {
    return `${cx},${cy - GATE_R} ${cx + GATE_R},${cy} ${cx},${cy + GATE_R} ${cx - GATE_R},${cy}`;
  }

  const loopbackActive = nodeStates.changes === 'done' && nodeStates.approve === 'idle';
  const loopbackStroke = loopbackActive
    ? 'rgba(251,146,60,0.65)'   // orange when active
    : 'rgba(128,144,166,0.20)'; // muted when idle

  return (
    <div ref={rootRef} className={cn('select-none', className)}>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        width="100%"
        height="100%"
        style={{ maxWidth: VW, display: 'block', margin: '0 auto' }}
        aria-label="Workflow execution graph with feedback loop"
        role="img"
      >
        {/* ── Defs ── */}
        <defs>
          {/* Forward edge paths */}
          {EDGE_PAIRS.map(([from, to]) => (
            <path key={`ep-${from}-${to}`} id={`ep-${from}-${to}`} d={edgePath(from, to)} />
          ))}
          {/* Loopback arc path */}
          <path id="ep-loopback" d={LOOPBACK_PATH} />

          {/* Arrowhead for loopback */}
          <marker id="arrow-loop" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="rgba(251,146,60,0.65)" />
          </marker>
          <marker id="arrow-loop-idle" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="rgba(128,144,166,0.25)" />
          </marker>

          {/* Glow filter */}
          <filter id="wlg-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="wlg-glow-orange" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Loopback arc (behind everything) ── */}
        <path
          d={LOOPBACK_PATH}
          fill="none"
          stroke={loopbackStroke}
          strokeWidth="1.5"
          strokeDasharray="5 3"
          markerEnd={loopbackActive ? 'url(#arrow-loop)' : 'url(#arrow-loop-idle)'}
          style={{ transition: 'stroke 0.4s' }}
        />

        {/* Loopback label */}
        <text
          x={NODES.changes.cx - NW / 2 - 44}
          y={(NODES.changes.cy + NODES.fetch.cy) / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontFamily="ui-monospace, monospace"
          fontSize="8"
          fill={loopbackActive ? 'rgba(251,146,60,0.80)' : 'rgba(128,144,166,0.30)'}
          style={{ transition: 'fill 0.4s' }}
        >
          retry
        </text>

        {/* ── Forward edges ── */}
        {EDGE_PAIRS.map(([from, to]) => (
          <use
            key={`edge-${from}-${to}`}
            href={`#ep-${from}-${to}`}
            fill="none"
            stroke={edgeStroke(from, to)}
            strokeWidth="1.5"
            strokeDasharray={
              (to === 'changes' && nodeStates.changes === 'skipped') ||
              (to === 'approve' && nodeStates.approve === 'skipped')
                ? '4 4' : undefined
            }
            style={{ transition: 'stroke 0.4s' }}
          />
        ))}

        {/* ── Animated tokens ── */}
        {tokens.map((tok) => (
          <circle
            key={tok.id}
            r={tok.loopback ? 5.5 : 5}
            fill={tok.loopback ? 'rgba(251,146,60,0.95)' : 'rgb(var(--color-accent))'}
            opacity="0.9"
            filter={tok.loopback ? 'url(#wlg-glow-orange)' : 'url(#wlg-glow)'}
          >
            <animateMotion dur={`${tok.dur}ms`} fill="freeze">
              <mpath href={tok.loopback ? '#ep-loopback' : `#ep-${tok.from}-${tok.to}`} />
            </animateMotion>
          </circle>
        ))}

        {/* ── Iteration counter (top-right) ── */}
        {iteration > 0 && (
          <g>
            <rect x={VW - 68} y={4} width={64} height={18} rx="9"
              fill={iteration === 2 ? 'rgba(52,211,153,0.12)' : 'rgba(251,146,60,0.12)'}
              stroke={iteration === 2 ? 'rgba(52,211,153,0.30)' : 'rgba(251,146,60,0.30)'}
              strokeWidth="0.75"
            />
            <text
              x={VW - 36} y={13}
              textAnchor="middle" dominantBaseline="middle"
              fontFamily="ui-monospace, monospace" fontSize="8" fontWeight="700"
              fill={iteration === 2 ? 'rgba(52,211,153,0.85)' : 'rgba(251,146,60,0.85)'}
            >
              iter {iteration} / 2
            </text>
          </g>
        )}

        {/* ── Trigger node ── */}
        {(() => {
          const { cx, cy, label } = NODES.trigger;
          const state = nodeStates.trigger;
          return (
            <g>
              <rect x={cx - TRIG_W / 2} y={cy - TRIG_H / 2} width={TRIG_W} height={TRIG_H} rx={TRIG_H / 2}
                fill={nodeFill(state, 'trigger')} stroke={nodeStroke(state, 'trigger')} strokeWidth="1"
                style={{ transition: 'fill 0.3s, stroke 0.3s' }} />
              {state === 'running' && (
                <rect x={cx - TRIG_W / 2} y={cy - TRIG_H / 2} width={TRIG_W} height={TRIG_H} rx={TRIG_H / 2}
                  fill="none" stroke="rgba(58,130,246,0.3)" strokeWidth="3" opacity="0">
                  <animate attributeName="opacity" values="0;0.8;0" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="stroke-width" values="2;6;2" dur="1.2s" repeatCount="indefinite" />
                </rect>
              )}
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                fontFamily="ui-monospace, monospace" fontSize="9.5" fontWeight="500"
                fill={nodeLabelColor(state, 'trigger')} style={{ transition: 'fill 0.3s' }}>
                {label}
              </text>
            </g>
          );
        })()}

        {/* ── Regular nodes ── */}
        {(['fetch', 'tests', 'review', 'approve', 'changes'] as NodeId[]).map((id) => {
          const { cx, cy, label, sub, kind } = NODES[id];
          const state = nodeStates[id];
          const isAgent = kind === 'agent';

          return (
            <g key={id}>
              <rect x={cx - NW / 2} y={cy - NH / 2} width={NW} height={NH} rx="7"
                fill={nodeFill(state, kind)} stroke={nodeStroke(state, kind)} strokeWidth="1"
                style={{ transition: 'fill 0.3s, stroke 0.3s' }} />
              {state === 'running' && (
                <rect x={cx - NW / 2} y={cy - NH / 2} width={NW} height={NH} rx="7"
                  fill="none" stroke="rgba(58,130,246,0.28)" strokeWidth="2" opacity="0">
                  <animate attributeName="opacity" values="0;1;0" dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="stroke-width" values="1;5;1" dur="1.4s" repeatCount="indefinite" />
                </rect>
              )}
              {(state === 'done' || state === 'running') && (
                <circle cx={cx - NW / 2 + 10} cy={cy} r="3"
                  fill={state === 'done' ? 'rgba(52,211,153,0.85)' : 'rgba(58,130,246,0.8)'}
                  style={{ transition: 'fill 0.3s' }} />
              )}
              <text x={sub ? cx - NW / 2 + 22 : cx} y={sub ? cy - 5 : cy + 1}
                textAnchor={sub ? 'start' : 'middle'} dominantBaseline="middle"
                fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="600"
                fill={nodeLabelColor(state, kind)} style={{ transition: 'fill 0.3s' }}>
                {label}
              </text>
              {sub && (
                <text x={cx - NW / 2 + 22} y={cy + 7} textAnchor="start" dominantBaseline="middle"
                  fontFamily="ui-monospace, monospace" fontSize="8" fill={subColor(state)}
                  style={{ transition: 'fill 0.3s' }}>
                  {sub}
                </text>
              )}
              {isAgent && state !== 'skipped' && (
                <>
                  <rect x={cx + NW / 2 - 36} y={cy - NH / 2 - 1} width={32} height={12} rx="3"
                    fill="rgba(58,130,246,0.12)" stroke="rgba(58,130,246,0.25)" strokeWidth="0.5" />
                  <text x={cx + NW / 2 - 20} y={cy - NH / 2 + 5.5}
                    textAnchor="middle" dominantBaseline="middle"
                    fontFamily="ui-monospace, monospace" fontSize="6.5" fontWeight="700"
                    fill="rgba(58,130,246,0.75)" letterSpacing="0.5">
                    AGENT
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* ── Gate (diamond) ── */}
        {(() => {
          const { cx, cy, label } = NODES.gate;
          const state = nodeStates.gate;
          return (
            <g>
              <polygon points={gateDiamond(cx, cy)}
                fill={nodeFill(state, 'gate')} stroke={nodeStroke(state, 'gate')} strokeWidth="1"
                style={{ transition: 'fill 0.3s, stroke 0.3s' }} />
              {state === 'running' && (
                <polygon points={gateDiamond(cx, cy)} fill="none" stroke="rgba(58,130,246,0.3)" strokeWidth="2" opacity="0">
                  <animate attributeName="opacity" values="0;0.9;0" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="stroke-width" values="1;5;1" dur="1s" repeatCount="indefinite" />
                </polygon>
              )}
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                fontFamily="ui-monospace, monospace" fontSize="9" fontWeight="600"
                fill={nodeLabelColor(state, 'gate')} style={{ transition: 'fill 0.3s' }}>
                {label}
              </text>
            </g>
          );
        })()}

        {/* ── Branch labels ── */}
        <text x={NODES.changes.cx + 10} y={(NODES.gate.cy + NODES.changes.cy) / 2}
          textAnchor="start" dominantBaseline="middle"
          fontFamily="ui-monospace, monospace" fontSize="8"
          fill={nodeStates.changes === 'running' || nodeStates.changes === 'done'
            ? 'rgba(251,146,60,0.70)'
            : nodeStates.changes === 'skipped'
            ? 'rgba(128,144,166,0.15)'
            : 'rgba(128,144,166,0.45)'}
          style={{ transition: 'fill 0.4s' }}>
          &lt; 7
        </text>
        <text x={NODES.approve.cx - 10} y={(NODES.gate.cy + NODES.approve.cy) / 2}
          textAnchor="end" dominantBaseline="middle"
          fontFamily="ui-monospace, monospace" fontSize="8"
          fill={nodeStates.approve === 'done' || nodeStates.approve === 'running'
            ? 'rgba(52,211,153,0.65)'
            : nodeStates.approve === 'skipped'
            ? 'rgba(128,144,166,0.15)'
            : 'rgba(128,144,166,0.45)'}
          style={{ transition: 'fill 0.4s' }}>
          ≥ 7
        </text>

        {/* ── Parallel label ── */}
        <text x={VW / 2} y={(NODES.fetch.cy + NODES.tests.cy) / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontFamily="ui-monospace, monospace" fontSize="7.5"
          fill={nodeStates.tests === 'running' || nodeStates.review === 'running'
            ? 'rgba(58,130,246,0.60)'
            : 'rgba(128,144,166,0.28)'}
          style={{ transition: 'fill 0.4s' }}>
          parallel
        </text>
      </svg>
    </div>
  );
}
