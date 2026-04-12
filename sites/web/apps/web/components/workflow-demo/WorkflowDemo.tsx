'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { OutputPanel } from './OutputPanel';
import { TASK_PRESETS, getGenericPreset } from './presets';
import type { TaskPreset, OutputLine } from './presets';
import s from './WorkflowDemo.module.css';

/* ── Pipeline definitions ─────────────────────────────────────────── */

type StepType = 'shell' | 'gate' | 'approval';
type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'waiting' | 'rework' | 'skipped';

interface PipelineStep {
  id: string;
  name: string;
  type: StepType;
  phase: string;
  description: string;
  canFail?: boolean;
  failMessage?: string;
}

interface Pipeline {
  id: string;
  label: string;
  description: string;
  steps: PipelineStep[];
  yaml: string;
}

const SIMPLE_PIPELINE: Pipeline = {
  id: 'simple',
  label: 'Dev Cycle',
  description: 'Standard AI-assisted development pipeline with plan → implement → review → commit flow.',
  yaml: `name: dev-cycle
description: AI-assisted development pipeline

steps:
  # ── Planning ──
  - id: plan
    uses: builtin:shell
    with:
      command: kb agent run --mode=plan --task="$TASK"

  - id: plan-gate
    uses: builtin:gate
    with:
      assert: plan.output != null

  - id: plan-approval
    uses: builtin:approval
    with:
      message: "Review the AI-generated plan"

  # ── Implementation ──
  - id: implement
    uses: builtin:shell
    with:
      command: kb agent run --mode=execute

  - id: changes-gate
    uses: builtin:gate
    with:
      assert: git.diff.files > 0

  # ── Quality ──
  - id: review
    uses: command:review:run
    with:
      mode: full

  - id: review-gate
    uses: builtin:gate
    with:
      assert: review.blockers == 0
      on_fail: rework
      rework_target: implement
      max_rework: 3

  - id: qa
    uses: builtin:shell
    with:
      command: pnpm --filter $SCOPE run build && pnpm run test

  - id: qa-gate
    uses: builtin:gate
    with:
      assert: qa.exit_code == 0

  # ── Delivery ──
  - id: result-approval
    uses: builtin:approval
    with:
      message: "Approve changes for commit"

  - id: commit
    uses: builtin:shell
    with:
      command: kb commit commit --scope=$SCOPE`,
  steps: [
    { id: 'plan', name: 'Plan', type: 'shell', phase: 'Planning', description: 'AI agent builds an implementation plan based on your task description.' },
    { id: 'plan-gate', name: 'Plan Gate', type: 'gate', phase: 'Planning', description: 'Automatic check: did the agent produce a valid plan?' },
    { id: 'plan-approval', name: 'Approve Plan', type: 'approval', phase: 'Planning', description: 'You review the AI-generated plan and approve or reject it.' },
    { id: 'implement', name: 'Implement', type: 'shell', phase: 'Implementation', description: 'AI agent executes the approved plan — writes code, modifies files.' },
    { id: 'implement-gate', name: 'Changes Gate', type: 'gate', phase: 'Implementation', description: 'Verify the agent actually produced file changes (git diff is non-empty).' },
    { id: 'review', name: 'Code Review', type: 'shell', phase: 'Quality', description: 'AI-powered code review analyzes the changes for bugs, style, and security.' },
    { id: 'review-gate', name: 'Review Gate', type: 'gate', phase: 'Quality', description: 'If review failed → rework loop (back to Implement). Max 3 iterations.' },
    { id: 'qa', name: 'Build & QA', type: 'shell', phase: 'Quality', description: 'Build the package and run type checks to ensure nothing is broken.' },
    { id: 'qa-gate', name: 'QA Gate', type: 'gate', phase: 'Quality', description: 'Hard fail if build breaks — no bypass allowed.' },
    { id: 'result-approval', name: 'Approve Result', type: 'approval', phase: 'Delivery', description: 'Final human review: approve to commit the changes.' },
    { id: 'commit', name: 'Commit', type: 'shell', phase: 'Delivery', description: 'AI generates conventional commit messages and applies them.' },
  ],
};

const ENTERPRISE_PIPELINE: Pipeline = {
  id: 'enterprise',
  label: 'Enterprise',
  description: 'Full compliance pipeline with security scans, license checks, and multi-level approval chain.',
  yaml: `name: enterprise-dev-cycle
description: Full compliance pipeline with security & legal gates

steps:
  # ── Planning ──
  - id: plan
    uses: builtin:shell
    with:
      command: kb agent run --mode=plan --task="$TASK"

  - id: plan-approval
    uses: builtin:approval
    with:
      message: "Tech Lead: review plan"
      notify: slack:#dev-leads

  # ── Implementation ──
  - id: implement
    uses: builtin:shell
    with:
      command: kb agent run --mode=execute

  # ── Quality Gates ──
  - id: review
    uses: command:review:run
    with:
      mode: full

  - id: review-gate
    uses: builtin:gate
    with:
      assert: review.blockers == 0
      on_fail: rework
      rework_target: implement
      max_rework: 3

  - id: qa
    uses: builtin:shell
    with:
      command: pnpm run build && pnpm run test

  - id: qa-gate
    uses: builtin:gate
    with:
      assert: qa.exit_code == 0

  # ── Compliance ──
  - id: security
    uses: builtin:shell
    with:
      command: snyk test && trivy fs .
      timeout: 300s

  - id: license
    uses: builtin:shell
    with:
      command: license-checker --failOn "GPL;AGPL"

  - id: compliance-gate
    uses: builtin:gate
    with:
      assert: security.critical == 0 && license.copyleft == 0

  # ── Approval Chain ──
  - id: lead-approval
    uses: builtin:approval
    with:
      message: "Team Lead: approve changes"
      notify: slack:#team-leads

  - id: legal-approval
    uses: builtin:approval
    with:
      message: "Legal: review security & license reports"
      notify: email:legal@company.com

  # ── Delivery ──
  - id: commit
    uses: builtin:shell
    with:
      command: kb commit commit --scope=$SCOPE --with-push

  - id: notify
    uses: builtin:shell
    with:
      command: curl -X POST $SLACK_WEBHOOK -d '{"text":"Pipeline complete"}'`,
  steps: [
    { id: 'plan', name: 'Plan', type: 'shell', phase: 'Planning', description: 'AI agent builds an implementation plan.' },
    { id: 'plan-approval', name: 'Tech Lead Approval', type: 'approval', phase: 'Planning', description: 'Tech Lead reviews the plan for architectural correctness.' },
    { id: 'implement', name: 'Implement', type: 'shell', phase: 'Implementation', description: 'AI agent executes the approved plan.' },
    { id: 'review', name: 'Code Review', type: 'shell', phase: 'Quality Gates', description: 'AI-powered code review.' },
    { id: 'review-gate', name: 'Review Gate', type: 'gate', phase: 'Quality Gates', description: 'Rework loop if review fails.' },
    { id: 'qa', name: 'Build & QA', type: 'shell', phase: 'Quality Gates', description: 'Build and type checks.' },
    { id: 'qa-gate', name: 'QA Gate', type: 'gate', phase: 'Quality Gates', description: 'Hard fail if build breaks.' },
    { id: 'security', name: 'Security Scan', type: 'shell', phase: 'Compliance', description: 'Vulnerability scanning (Snyk, Trivy, Semgrep).' },
    { id: 'license', name: 'License Check', type: 'shell', phase: 'Compliance', description: 'Verify all dependencies use permissive licenses.' },
    { id: 'compliance-gate', name: 'Compliance Gate', type: 'gate', phase: 'Compliance', description: 'Fail if security or license issues found.' },
    { id: 'lead-approval', name: 'Team Lead Approval', type: 'approval', phase: 'Approval Chain', description: 'Team Lead approves after all automated checks pass.' },
    { id: 'legal-approval', name: 'Legal Review', type: 'approval', phase: 'Approval Chain', description: 'Legal/Compliance officer reviews security and license reports.' },
    { id: 'commit', name: 'Commit', type: 'shell', phase: 'Delivery', description: 'AI generates conventional commits.' },
    { id: 'notify', name: 'Notify', type: 'shell', phase: 'Delivery', description: 'Send completion notification to Slack.' },
  ],
};

/* ── Rework targets: which step to go back to when rejecting ── */
const REWORK_TARGETS: Record<string, string> = {
  'plan-approval': 'plan',
  'result-approval': 'implement',
  'lead-approval': 'implement',
  'legal-approval': 'implement',
};

/* ── Simple YAML syntax highlighter ── */
function highlightYaml(yaml: string) {
  return yaml.split('\n').map((line, i) => {
    // Comment lines
    if (line.trimStart().startsWith('#')) {
      return <div key={i}><span className={s.yComment}>{line}</span></div>;
    }

    // Key: value lines
    const kvMatch = line.match(/^(\s*-?\s*)(\w[\w.-]*)(:)(.*)/);
    if (kvMatch) {
      const [, indent, key, colon, rest] = kvMatch;
      let valueEl: React.ReactNode = rest;

      const trimmed = rest.trim();
      if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
        valueEl = <span className={s.yString}>{rest}</span>;
      } else if (/^(true|false|null)$/i.test(trimmed)) {
        valueEl = <span className={s.yBool}>{rest}</span>;
      } else if (/^\d+[smhd]?$/.test(trimmed)) {
        valueEl = <span className={s.yNumber}>{rest}</span>;
      } else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        // Inline arrays/objects — color the values inside
        valueEl = <span className={s.yString}>{rest}</span>;
      } else if (trimmed && !trimmed.startsWith('|') && !trimmed.startsWith('>')) {
        valueEl = <span className={s.yString}>{rest}</span>;
      }

      return (
        <div key={i}>
          {indent}<span className={s.yKey}>{key}</span><span className={s.yColon}>{colon}</span>{valueEl}
        </div>
      );
    }

    // Bare list items or plain text
    return <div key={i}>{line}</div>;
  });
}

/* ── Default line delay ── */
const LINE_DELAY_MS = 70;

/* ── Component ──────────────────────────────────────────────── */

interface WorkflowDemoProps {
  compact?: boolean;
  demoLink?: string;
}

export function WorkflowDemo({ compact = false, demoLink }: WorkflowDemoProps) {
  const [activePipeline, setActivePipeline] = useState<'simple' | 'enterprise'>('simple');
  const [viewMode, setViewMode] = useState<'demo' | 'yaml'>('demo');
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Task selection
  const [selectedTask, setSelectedTask] = useState<TaskPreset | null>(compact ? TASK_PRESETS[0] : null);
  const [customTaskInput, setCustomTaskInput] = useState('');

  // Output panel
  const [outputLines, setOutputLines] = useState<OutputLine[]>([]);
  const [visibleLineCount, setVisibleLineCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentApprovalContext, setCurrentApprovalContext] = useState<string | undefined>();

  // Reject flow
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [isReworked, setIsReworked] = useState<Record<string, boolean>>({});

  // Completion stats
  const [completionStats, setCompletionStats] = useState<{ filesChanged: number; commitsCreated: number; time: number; reworks: number } | null>(null);
  const startTimeRef = useRef(0);
  const rejectCountRef = useRef(0);

  // Refs
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stepsContainerRef = useRef<HTMLDivElement>(null);
  const advanceRef = useRef<(fromIndex: number) => void>(() => {});

  const pipeline = activePipeline === 'simple' ? SIMPLE_PIPELINE : ENTERPRISE_PIPELINE;
  const steps = pipeline.steps;

  // Group steps by phase
  const phases = steps.reduce<Array<{ name: string; steps: Array<PipelineStep & { globalIndex: number }> }>>((acc, step, i) => {
    const last = acc[acc.length - 1];
    if (last && last.name === step.phase) {
      last.steps.push({ ...step, globalIndex: i });
    } else {
      acc.push({ name: step.phase, steps: [{ ...step, globalIndex: i }] });
    }
    return acc;
  }, []);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (streamIntervalRef.current) { clearInterval(streamIntervalRef.current); streamIntervalRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setStepStatuses({});
    setCurrentStepIndex(-1);
    setIsRunning(false);
    setCompleted(false);
    setOutputLines([]);
    setVisibleLineCount(0);
    setIsStreaming(false);
    setCurrentApprovalContext(undefined);
    setRejectMode(false);
    setRejectFeedback('');
    setIsReworked({});
    setCompletionStats(null);
    rejectCountRef.current = 0;
  }, [clearTimers]);

  // Reset when switching pipelines
  useEffect(() => {
    reset();
  }, [activePipeline, reset]);

  // Auto-scroll to current step (within container, not page)
  useEffect(() => {
    if (currentStepIndex < 0 || !stepsContainerRef.current) return;
    const container = stepsContainerRef.current;
    const stepEl = container.querySelector(`[data-step-index="${currentStepIndex}"]`) as HTMLElement | null;
    if (stepEl) {
      const top = stepEl.offsetTop - container.offsetTop;
      container.scrollTo({ top: Math.max(0, top - 40), behavior: 'smooth' });
    }
  }, [currentStepIndex]);

  // Stream lines for current step
  const streamLines = useCallback((lines: OutputLine[], onDone: () => void) => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    setOutputLines(lines);
    setVisibleLineCount(0);
    setIsStreaming(true);

    if (lines.length === 0) {
      setIsStreaming(false);
      onDone();
      return;
    }

    let count = 0;
    streamIntervalRef.current = setInterval(() => {
      count++;
      setVisibleLineCount(count);
      if (count >= lines.length) {
        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
        setIsStreaming(false);
        onDone();
      }
    }, LINE_DELAY_MS);
  }, []);

  // Core step advancement
  const advanceStep = useCallback((fromIndex: number) => {
    const step = steps[fromIndex];
    if (!step) {
      // Pipeline complete
      setIsRunning(false);
      setCompleted(true);
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      setCompletionStats({
        filesChanged: selectedTask?.stats.filesChanged ?? 3,
        commitsCreated: selectedTask?.stats.commitsCreated ?? 1,
        time: elapsed,
        reworks: rejectCountRef.current,
      });
      return;
    }

    setCurrentStepIndex(fromIndex);
    setStepStatuses((prev) => ({ ...prev, [step.id]: 'running' }));
    setRejectMode(false);
    setRejectFeedback('');

    // Get content for this step
    const stepContent = selectedTask?.stepContent[step.id];
    const useRework = isReworked[step.id] && stepContent?.reworkLines;
    const lines = useRework ? stepContent!.reworkLines! : (stepContent?.lines ?? []);
    const approvalCtx = useRework ? stepContent?.reworkApprovalContext : stepContent?.approvalContext;

    if (step.type === 'approval') {
      // Show approval context in output, then wait for user
      setCurrentApprovalContext(approvalCtx);
      if (lines.length > 0) {
        streamLines(lines, () => {
          setStepStatuses((prev) => ({ ...prev, [step.id]: 'waiting' }));
        });
      } else {
        setOutputLines([]);
        setVisibleLineCount(0);
        setIsStreaming(false);
        setStepStatuses((prev) => ({ ...prev, [step.id]: 'waiting' }));
      }
      return;
    }

    // Shell / Gate: stream lines then advance
    setCurrentApprovalContext(undefined);
    streamLines(lines, () => {
      // Small delay after lines finish to let user see result
      timeoutRef.current = setTimeout(() => {
        setStepStatuses((prev) => ({ ...prev, [step.id]: 'passed' }));
        advanceRef.current(fromIndex + 1);
      }, 300);
    });
  }, [steps, selectedTask, isReworked, streamLines]);

  // Keep ref in sync (for recursive calls via timeout)
  advanceRef.current = advanceStep;

  const startPipeline = useCallback(() => {
    reset();
    setIsRunning(true);
    startTimeRef.current = Date.now();
    timeoutRef.current = setTimeout(() => {
      advanceRef.current(0);
    }, 300);
  }, [reset]);

  const handleApprove = useCallback(() => {
    const step = steps[currentStepIndex];
    if (!step) return;
    setStepStatuses((prev) => ({ ...prev, [step.id]: 'passed' }));
    setCurrentApprovalContext(undefined);
    advanceRef.current(currentStepIndex + 1);
  }, [currentStepIndex, steps]);

  const handleRejectSubmit = useCallback(() => {
    const step = steps[currentStepIndex];
    if (!step) return;

    // If already reworked this step, auto-approve
    if (isReworked[step.id]) {
      setStepStatuses((prev) => ({ ...prev, [step.id]: 'passed' }));
      setCurrentApprovalContext(undefined);
      setRejectMode(false);
      advanceRef.current(currentStepIndex + 1);
      return;
    }

    // Trigger rework
    rejectCountRef.current++;
    setStepStatuses((prev) => ({ ...prev, [step.id]: 'failed' }));
    setRejectMode(false);
    setRejectFeedback('');

    const reworkTarget = REWORK_TARGETS[step.id] || 'implement';
    const targetIdx = steps.findIndex((s) => s.id === reworkTarget);

    if (targetIdx >= 0) {
      // Mark steps from target to current as reworked
      const newReworked: Record<string, boolean> = {};
      for (let i = targetIdx; i <= currentStepIndex; i++) {
        newReworked[steps[i].id] = true;
      }
      setIsReworked((prev) => ({ ...prev, ...newReworked }));

      // Show rework message briefly, then restart from target
      timeoutRef.current = setTimeout(() => {
        // Reset statuses from target to current
        const resetStatuses: Record<string, StepStatus> = {};
        for (let i = targetIdx; i <= currentStepIndex; i++) {
          resetStatuses[steps[i].id] = 'pending';
        }
        setStepStatuses((prev) => ({ ...prev, ...resetStatuses }));
        advanceRef.current(targetIdx);
      }, 800);
    }
  }, [currentStepIndex, steps, isReworked]);

  const handleSelectPreset = useCallback((preset: TaskPreset) => {
    setSelectedTask(preset);
  }, []);

  const handleCustomSubmit = useCallback(() => {
    if (!customTaskInput.trim()) return;
    setSelectedTask(getGenericPreset(customTaskInput.trim()));
  }, [customTaskInput]);

  const handleChangeTask = useCallback(() => {
    reset();
    setSelectedTask(null);
    setCustomTaskInput('');
  }, [reset]);

  /* ── Icon rendering ── */

  const getStepIcon = (step: PipelineStep, status: StepStatus) => {
    if (status === 'passed') return <span className={`${s.icon} ${s.iconPassed}`}>&#10003;</span>;
    if (status === 'failed') return <span className={`${s.icon} ${s.iconFailed}`}>&#10007;</span>;
    if (status === 'running') return <span className={`${s.icon} ${s.iconRunning}`} />;
    if (status === 'waiting') return <span className={`${s.icon} ${s.iconWaiting}`}>&#9202;</span>;
    if (status === 'rework') return <span className={`${s.icon} ${s.iconRework}`}>&#8634;</span>;
    if (step.type === 'gate') return <span className={`${s.icon} ${s.iconGate}`}>&#9670;</span>;
    if (step.type === 'approval') return <span className={`${s.icon} ${s.iconApproval}`}>&#9679;</span>;
    return <span className={`${s.icon} ${s.iconPending}`}>&#9675;</span>;
  };

  /* ── Get inline hint for compact mode ── */
  const getStepHint = (step: PipelineStep, status: StepStatus): string | null => {
    if (status !== 'passed' && status !== 'failed') return null;
    const content = selectedTask?.stepContent[step.id];
    if (!content) return null;
    // Find first success or error line as a hint
    const hintLine = content.lines.find((l) => l.type === 'success' || l.type === 'error');
    return hintLine?.text ?? null;
  };

  /* ── Current step info for output panel ── */
  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;

  /* ── Render ── */

  return (
    <div className={`${s.demo} ${compact ? s.compact : s.full}`}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.toggle}>
          <button
            className={`${s.toggleBtn} ${activePipeline === 'simple' ? s.toggleActive : ''}`}
            onClick={() => { setActivePipeline('simple'); setViewMode('demo'); }}
            disabled={isRunning}
          >
            Dev Cycle
          </button>
          <button
            className={`${s.toggleBtn} ${activePipeline === 'enterprise' ? s.toggleActive : ''}`}
            onClick={() => { setActivePipeline('enterprise'); setViewMode('demo'); }}
            disabled={isRunning}
          >
            Enterprise
          </button>
        </div>
        <div className={s.viewToggle}>
          <button
            className={`${s.viewBtn} ${viewMode === 'demo' ? s.viewBtnActive : ''}`}
            onClick={() => setViewMode('demo')}
          >
            Demo
          </button>
          <button
            className={`${s.viewBtn} ${viewMode === 'yaml' ? s.viewBtnActive : ''}`}
            onClick={() => setViewMode('yaml')}
          >
            YAML
          </button>
        </div>
        <div className={s.headerActions}>
          {selectedTask && !isRunning && !completed && (
            <button className={s.runBtn} onClick={startPipeline}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,1 11,6 2,11" /></svg>
              Run Pipeline
            </button>
          )}
          {(isRunning || completed) && (
            <button className={s.resetBtn} onClick={compact ? reset : handleChangeTask}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Task selection (full mode only, when no task selected) */}
      {viewMode === 'demo' && !compact && !selectedTask && !isRunning && !completed && (
        <div className={s.taskSelection}>
          <div className={s.taskLabel}>Choose a task to run through the pipeline:</div>
          <div className={s.presetButtons}>
            {TASK_PRESETS.map((preset) => (
              <button key={preset.id} className={s.presetBtn} onClick={() => handleSelectPreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>
          <div className={s.customInputRow}>
            <input
              className={s.customInput}
              type="text"
              placeholder="Or type your own task..."
              value={customTaskInput}
              onChange={(e) => setCustomTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
            />
            {customTaskInput.trim() && (
              <button className={s.customSubmitBtn} onClick={handleCustomSubmit}>Go</button>
            )}
          </div>
        </div>
      )}

      {/* Selected task indicator (full mode) */}
      {viewMode === 'demo' && !compact && selectedTask && !isRunning && !completed && (
        <div className={s.taskSelection}>
          <div className={s.selectedTask}>
            <span className={s.selectedTaskLabel}>{selectedTask.label}</span>
            <button className={s.changeTaskBtn} onClick={handleChangeTask}>change</button>
          </div>
        </div>
      )}

      {/* Pipeline description */}
      <p className={s.pipelineDesc}>{pipeline.description}</p>

      {/* YAML source view */}
      {viewMode === 'yaml' ? (
        <div className={s.yamlView}>
          <div className={s.yamlHeader}>
            <span className={s.yamlDot} />
            <span className={s.yamlDot} />
            <span className={s.yamlDot} />
            <span className={s.yamlFileName}>workflow.yaml</span>
          </div>
          <pre className={s.yamlCode}><code>{highlightYaml(pipeline.yaml)}</code></pre>
        </div>
      ) : null}

      {/* Two-panel layout (or single panel in compact) */}
      {viewMode === 'demo' && (isRunning || completed || compact) ? (
        <div className={compact ? undefined : s.layout}>
          {/* Pipeline panel */}
          <div className={compact ? undefined : s.pipelinePanel}>
            <div className={s.stepsContainer} ref={stepsContainerRef}>
              {phases.map((phase) => (
                <div key={phase.name} className={s.phase}>
                  <div className={s.phaseLabel}>{phase.name}</div>
                  <div className={s.phaseSteps}>
                    {phase.steps.map((step) => {
                      const status = stepStatuses[step.id] || 'pending';
                      const isActive = step.globalIndex === currentStepIndex;
                      const hint = compact ? getStepHint(step, status) : null;

                      return (
                        <div
                          key={step.id}
                          data-step-index={step.globalIndex}
                          className={`${s.step} ${s[`status_${status}`] || ''} ${isActive ? s.stepActive : ''}`}
                        >
                          <div className={s.stepLine}>
                            {getStepIcon(step, status)}
                            <div className={s.stepInfo}>
                              <div className={s.stepTop}>
                                <span className={s.stepName}>{step.name}</span>
                                <span className={`${s.typeBadge} ${s[`type_${step.type}`]}`}>{step.type}</span>
                              </div>
                              {(isActive || !compact) && (
                                <p className={s.stepDesc}>{step.description}</p>
                              )}
                              {status === 'failed' && step.failMessage && (
                                <p className={s.failMsg}>{step.failMessage}</p>
                              )}
                              {/* Inline hint in compact mode */}
                              {compact && hint && (
                                <p className={`${s.stepHint} ${status === 'passed' ? s.stepHintSuccess : ''}`}>
                                  {hint}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Approval buttons */}
                          {status === 'waiting' && isActive && (
                            <>
                              <div className={s.approvalActions}>
                                <button className={s.approveBtn} onClick={handleApprove}>
                                  Approve
                                </button>
                                <button className={s.rejectBtn} onClick={() => setRejectMode(true)}>
                                  Reject
                                </button>
                              </div>
                              <div className={`${s.rejectArea} ${rejectMode ? s.rejectAreaOpen : ''}`}>
                                <textarea
                                  className={s.rejectTextarea}
                                  placeholder="What should change?"
                                  value={rejectFeedback}
                                  onChange={(e) => setRejectFeedback(e.target.value)}
                                  rows={2}
                                />
                                <button className={s.submitFeedbackBtn} onClick={handleRejectSubmit}>
                                  Submit &amp; Rework
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Completion */}
              {completed && (
                <div className={s.completionBanner}>
                  <span className={s.completionIcon}>&#10003;</span>
                  <div>
                    Pipeline completed successfully
                    {completionStats && (
                      <div className={s.completionStats}>
                        <div className={s.statItem2}>
                          <span className={s.statValue}>{completionStats.filesChanged}</span>
                          <span className={s.statLabel2}>files</span>
                        </div>
                        <div className={s.statItem2}>
                          <span className={s.statValue}>{completionStats.commitsCreated}</span>
                          <span className={s.statLabel2}>commits</span>
                        </div>
                        <div className={s.statItem2}>
                          <span className={s.statValue}>{completionStats.time}s</span>
                          <span className={s.statLabel2}>time</span>
                        </div>
                        {completionStats.reworks > 0 && (
                          <div className={s.statItem2}>
                            <span className={s.statValue}>{completionStats.reworks}</span>
                            <span className={s.statLabel2}>reworks</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Output panel (full mode only) */}
          {!compact && (
            <div className={s.outputPanelWrap}>
              <OutputPanel
                stepName={currentStep?.name ?? null}
                stepType={currentStep?.type ?? null}
                lines={outputLines}
                visibleCount={visibleLineCount}
                isStreaming={isStreaming}
                approvalContext={currentApprovalContext}
              />
            </div>
          )}
        </div>
      ) : null}

      {/* Compact: link to full demo */}
      {compact && demoLink && (
        <a className={s.demoLink} href={demoLink}>
          See full interactive demo &rarr;
        </a>
      )}
    </div>
  );
}
