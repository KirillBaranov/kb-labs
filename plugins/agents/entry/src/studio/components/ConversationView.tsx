/**
 * Turn-based conversation UI — Claude Code style
 * Adapted from studio/modules/agents for plugin widget use.
 * UIKit-only: no CSS file, all styles via antd token.
 */

import React from 'react';
import { theme } from 'antd';
import type { Turn, TurnStep, FileChangeSummary } from '@kb-labs/agent-contracts';
import {
  useMutateData,
  useData,
  UISpin,
  UIMarkdownViewer,
  UIModalConfirm,
  UITag,
  UITypographyText,
  UIFlex,
} from '@kb-labs/sdk/studio';

const { useToken } = theme;

interface ConversationViewProps {
  turns: Turn[];
  isLoading?: boolean;
  sessionId?: string | null;
}

export function ConversationView({ turns, isLoading, sessionId }: ConversationViewProps) {
  const { token } = useToken();

  if (isLoading) {
    return (
      <UIFlex justify="center" align="center" style={{ minHeight: 240, gap: 8 }}>
        <UISpin size="small" />
        <UITypographyText type="secondary" style={{ fontSize: 13 }}>Loading history...</UITypographyText>
      </UIFlex>
    );
  }

  if (turns.length === 0) {
    return (
      <UIFlex justify="center" align="center" style={{ minHeight: 240 }}>
        <UITypographyText type="secondary" style={{ fontSize: 14 }}>Ask anything to get started</UITypographyText>
      </UIFlex>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '16px 16px 40px', gap: 24 }}>
      {turns.map((turn) => (
        <TurnView key={turn.id} turn={turn} sessionId={sessionId} token={token} />
      ))}
    </div>
  );
}

// ---------- TurnView ----------

function TurnView({ turn, sessionId, token }: { turn: Turn; sessionId?: string | null; token: ReturnType<typeof useToken>['token'] }) {
  if (turn.type === 'user') {
    const text = turn.steps.find((s) => s.type === 'text');
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{
          maxWidth: '68%',
          background: token.colorFillTertiary,
          borderRadius: `${token.borderRadiusLG}px ${token.borderRadiusLG}px 3px ${token.borderRadiusLG}px`,
          padding: '10px 16px',
          fontSize: 14,
          lineHeight: 1.55,
          color: token.colorText,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {text?.type === 'text' ? text.content : ''}
        </span>
      </div>
    );
  }

  const isStreaming = turn.status === 'streaming';
  const textSteps = turn.steps.filter((s) => s.type === 'text');
  const visibleTextSteps = textSteps.filter(
    (s) => !isInternalProgressText(s.content ?? '') && s.content?.trim(),
  );
  const hasInternalProgressText = textSteps.some((s) => isInternalProgressText(s.content ?? ''));

  const reportStep = turn.steps.find(
    (s) => s.type === 'tool_use' && (s as import('@kb-labs/agent-contracts').ToolUseStep).toolName === 'report'
  ) as import('@kb-labs/agent-contracts').ToolUseStep | undefined;
  const reportAnswer = (reportStep?.input as Record<string, unknown> | null)?.answer as string | undefined;

  const visibleSteps = turn.steps.filter(
    (s) => s.type !== 'text' && !(s.type === 'tool_use' && (s as import('@kb-labs/agent-contracts').ToolUseStep).toolName === 'report')
  );
  const hasToolSteps = visibleSteps.length > 0 || isStreaming || hasInternalProgressText;

  const answerContent = reportAnswer || null;
  const fileChanges = turn.metadata?.fileChanges;
  const runId = turn.metadata?.runId;
  const showFileChanges = !isStreaming && fileChanges && fileChanges.length > 0 && !!sessionId && !!runId;

  const timelineStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    borderLeft: `2px solid ${token.colorBorderSecondary}`,
    paddingLeft: 12,
    gap: 6,
    marginLeft: 6,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {hasToolSteps && (
        <div style={timelineStyle}>
          {visibleSteps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              isLast={false}
              isStreaming={isStreaming && i === visibleSteps.length - 1 && !answerContent && visibleTextSteps.length === 0}
              token={token}
            />
          ))}
          {isStreaming && (turn.steps.length === 0 || hasInternalProgressText) && (
            <ThinkingRow token={token} />
          )}
        </div>
      )}
      {answerContent && (
        <div style={timelineStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <StepDot color={token.colorPrimary} pulse={false} />
            <UIMarkdownViewer content={answerContent} style={{ flex: 1 }} />
          </div>
        </div>
      )}
      {!answerContent && visibleTextSteps.map((step) => (
        step.type === 'text' && step.content?.trim() ? (
          <div key={step.id} style={timelineStyle}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <StepDot color={token.colorPrimary} pulse={false} />
              <UIMarkdownViewer content={step.content} style={{ flex: 1 }} />
            </div>
          </div>
        ) : null
      ))}
      {showFileChanges && (
        <div style={timelineStyle}>
          <FileChangesBlock
            sessionId={sessionId!}
            runId={runId!}
            fileChanges={fileChanges!}
            token={token}
          />
        </div>
      )}
    </div>
  );
}

// ---------- StepDot ----------

function StepDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span style={{
      flexShrink: 0,
      width: 10,
      height: 10,
      marginTop: 5,
      borderRadius: '50%',
      background: color,
      opacity: pulse ? 0.7 : 1,
      animation: pulse ? 'none' : undefined,
    }} />
  );
}

// ---------- ThinkingRow ----------

function ThinkingRow({ token }: { token: ReturnType<typeof useToken>['token'] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <StepDot color={token.colorTextTertiary} pulse={true} />
      <UITypographyText type="secondary" style={{ fontSize: 13 }}>Agent is analyzing and executing steps...</UITypographyText>
    </div>
  );
}

// ---------- StepRow ----------

function StepRow({ step, isStreaming, token }: { step: TurnStep; isLast: boolean; isStreaming: boolean; token: ReturnType<typeof useToken>['token'] }) {
  switch (step.type) {
    case 'thinking': {
      const content = step.content?.trim() ?? '';
      if (isNoisyThinking(content)) { return null; }
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <StepDot color={token.colorWarning} pulse={isStreaming} />
          <div style={{ flex: 1 }}>
            <UIMarkdownViewer content={content} style={{ fontSize: 13, opacity: 0.8 }} />
          </div>
        </div>
      );
    }

    case 'tool_use':
      return <ToolRow step={step} isStreaming={isStreaming} token={token} />;

    case 'tool_result':
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <StepDot color={step.success ? token.colorSuccess : token.colorError} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
              <span style={{ fontWeight: 500, color: token.colorText }}>{formatToolName(step.toolName)}</span>
              {step.durationMs !== undefined && (
                <span style={{ marginLeft: 6, fontSize: 11, color: token.colorTextTertiary }}>{step.durationMs}ms</span>
              )}
            </span>
            {!step.success && step.error && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: token.colorError }}>{step.error}</p>
            )}
          </div>
        </div>
      );

    case 'subagent':
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <StepDot color={token.colorPrimary} />
          <span style={{ fontSize: 13, color: token.colorTextSecondary }}>
            <span style={{ fontWeight: 500, color: token.colorText }}>Agent: {step.agentName}</span>
            <span style={{ marginLeft: 6 }}> — {step.task?.slice(0, 60)}{(step.task?.length ?? 0) > 60 ? '...' : ''}</span>
          </span>
        </div>
      );

    case 'error':
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <StepDot color={token.colorError} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: token.colorError }}>{step.code}</span>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: token.colorError }}>{step.message}</p>
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ---------- ToolRow ----------

function ToolRow({
  step,
  isStreaming,
  token,
}: {
  step: import('@kb-labs/agent-contracts').ToolUseStep;
  isStreaming: boolean;
  token: ReturnType<typeof useToken>['token'];
}) {
  const [open, setOpen] = React.useState(false);

  const isPending = step.status === 'pending';
  const isDone = step.status === 'done';
  const isError = step.status === 'error';
  const isFailed = isDone && step.success === false;

  const meta = getToolMeta(step);
  const hasDiff = isDone && !!step.metadata?.diff;
  const hasOutput = isDone && step.output != null;
  const input = step.input as Record<string, unknown> | null | undefined;
  const isWriteTool = /write|patch|edit/i.test(step.toolName);
  const hasWriteInput = isWriteTool && isDone && !!(input?.content ?? input?.new_content);
  const canExpand = hasOutput || hasDiff || hasWriteInput || isError;

  const dotColor = isPending
    ? (isStreaming ? token.colorTextTertiary : token.colorPrimary)
    : (isDone && !isFailed ? token.colorSuccess : token.colorError);

  const m = step.metadata;
  const todoList = (isDone && m?.uiHint === 'todo' && m.structured != null)
    ? (m.structured as Record<string, unknown>).todoList as TodoListData | undefined
    : undefined;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <StepDot color={dotColor} pulse={isPending && isStreaming} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header button */}
        <button
          onClick={() => canExpand && setOpen((v) => !v)}
          disabled={!canExpand}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: canExpand ? 'pointer' : 'default',
            fontSize: 13,
            color: token.colorText,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 500 }}>{formatToolName(step.toolName)}</span>
          {meta.badge && (
            <span style={{ fontSize: 11, color: token.colorTextSecondary, background: token.colorFillSecondary, borderRadius: token.borderRadiusSM, padding: '0 5px' }}>
              {meta.badge}
            </span>
          )}
          {isDone && m?.resultCount !== undefined && (
            <span style={{ fontSize: 11, color: token.colorTextSecondary, background: token.colorFillSecondary, borderRadius: token.borderRadiusSM, padding: '0 5px' }}>
              {m.resultCount} results
            </span>
          )}
          {isDone && m?.confidence !== undefined && (
            <span style={{ fontSize: 11, color: token.colorTextSecondary, background: token.colorFillSecondary, borderRadius: token.borderRadiusSM, padding: '0 5px' }}>
              {Math.round(m.confidence * 100)}%
            </span>
          )}
          {isDone && m?.exitCode !== undefined && m.exitCode !== 0 && (
            <span style={{ fontSize: 11, color: token.colorError, background: token.colorErrorBg, borderRadius: token.borderRadiusSM, padding: '0 5px' }}>
              exit {m.exitCode}
            </span>
          )}
          {isDone && (m?.linesAdded !== undefined || m?.linesRemoved !== undefined) && (
            <span style={{ fontSize: 11, color: token.colorSuccess, background: token.colorSuccessBg, borderRadius: token.borderRadiusSM, padding: '0 5px' }}>
              {m?.linesAdded != null && m.linesAdded > 0 ? `+${m.linesAdded}` : ''}
              {m?.linesRemoved != null && m.linesRemoved > 0 ? ` -${m.linesRemoved}` : ''}
            </span>
          )}
          {!isPending && step.durationMs !== undefined && (
            <span style={{ fontSize: 11, color: token.colorTextTertiary }}>{step.durationMs}ms</span>
          )}
          {canExpand && (
            <span style={{ fontSize: 11, color: token.colorTextTertiary }}>{open ? 'collapse' : 'expand'}</span>
          )}
        </button>

        {/* Summary / file path */}
        {meta.summary && (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: token.colorTextSecondary }}>
            {meta.filePath
              ? <CopyPath path={meta.filePath} label={meta.summary} token={token} />
              : meta.summary}
          </p>
        )}

        {/* Todo list */}
        {todoList != null && <TodoView todoList={todoList} token={token} />}

        {/* Errors */}
        {isError && step.error && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: token.colorError }}>{step.error}</p>
        )}
        {isFailed && !open && step.output != null && (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: token.colorError }}>{String(step.output)}</p>
        )}

        {/* Expanded details */}
        {open && (
          <div style={{ marginTop: 6 }}>
            <ToolDetails step={step} hasDiff={hasDiff} hasOutput={hasOutput} token={token} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ToolDetails ----------

function ToolDetails({
  step,
  hasDiff,
  hasOutput,
  token,
}: {
  step: import('@kb-labs/agent-contracts').ToolUseStep;
  hasDiff: boolean;
  hasOutput: boolean;
  token: ReturnType<typeof useToken>['token'];
}) {
  const input = step.input as Record<string, unknown> | null | undefined;
  const toolLower = step.toolName.toLowerCase();

  const isWrite = toolLower.includes('write') || toolLower.includes('patch') || toolLower.includes('edit');
  const isRead = toolLower.includes('read');
  const isShell = toolLower.includes('bash') || toolLower.includes('exec') || toolLower.includes('shell') || toolLower.includes('run');
  const isSearch = toolLower.includes('grep') || toolLower.includes('search') || toolLower.includes('glob') || toolLower.includes('list') || toolLower.includes('rag');

  const codePreStyle: React.CSSProperties = {
    margin: 0,
    padding: '8px 10px',
    fontSize: 12,
    lineHeight: 1.5,
    borderRadius: token.borderRadius,
    overflow: 'auto',
    maxHeight: 300,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

  if (isWrite) {
    if (hasDiff) { return <DiffView diff={step.metadata!.diff!} token={token} />; }
    const content = (input?.content ?? input?.new_content ?? input?.text) as string | undefined;
    if (content) {
      const filePath = (input?.path ?? input?.filePath ?? input?.file_path ?? input?.file) as string | undefined;
      const ext = filePath ? filePath.split('.').pop() : undefined;
      return (
        <div>
          {filePath && (
            <div style={{ fontSize: 11, color: token.colorTextTertiary, padding: '3px 8px', background: token.colorFillSecondary, borderRadius: `${token.borderRadius}px ${token.borderRadius}px 0 0` }}>
              {filePath}
            </div>
          )}
          <pre style={{ ...codePreStyle, background: token.colorFillSecondary, borderRadius: filePath ? `0 0 ${token.borderRadius}px ${token.borderRadius}px` : token.borderRadius }}
            className={ext ? `lang-${ext}` : undefined}
          >{String(content)}</pre>
        </div>
      );
    }
    return null;
  }

  if (isRead && hasOutput) {
    return <pre style={{ ...codePreStyle, background: token.colorFillSecondary }}>{formatOutput(step.output)}</pre>;
  }
  if (isShell && hasOutput) {
    return <pre style={{ ...codePreStyle, background: token.colorBgSpotlight, color: token.colorTextLightSolid }}>{formatOutput(step.output)}</pre>;
  }
  if (isSearch && hasOutput) {
    return <pre style={{ ...codePreStyle, background: token.colorFillSecondary }}>{formatOutput(step.output)}</pre>;
  }

  if (hasDiff) { return <DiffView diff={step.metadata!.diff!} token={token} />; }
  if (hasOutput) {
    const isFailed = step.status === 'done' && step.success === false;
    const outputStr = formatOutput(step.output);
    if (isFailed) {
      return (
        <pre style={{ ...codePreStyle, background: token.colorErrorBg, color: token.colorError }}>
          {outputStr}
        </pre>
      );
    }
    return <UIMarkdownViewer content={outputStr} style={{ fontSize: 12 }} />;
  }
  return null;
}

// ---------- DiffView ----------

function DiffView({ diff, token }: { diff: string; token: ReturnType<typeof useToken>['token'] }) {
  const lines = diff.split('\n');
  return (
    <pre style={{
      margin: 0,
      padding: '8px 10px',
      fontSize: 12,
      lineHeight: 1.5,
      borderRadius: token.borderRadius,
      overflow: 'auto',
      maxHeight: 300,
      background: token.colorFillSecondary,
      whiteSpace: 'pre',
    }}>
      {lines.map((line, i) => {
        const color =
          line.startsWith('+') && !line.startsWith('+++') ? token.colorSuccess :
          line.startsWith('-') && !line.startsWith('---') ? token.colorError :
          line.startsWith('@@') ? token.colorInfo :
          undefined;
        return (
          <span key={i} style={color ? { color } : undefined}>{line}{'\n'}</span>
        );
      })}
    </pre>
  );
}

// ---------- CopyPath ----------

function CopyPath({ path, label, token }: { path: string; label: string; token: ReturnType<typeof useToken>['token'] }) {
  const [copied, setCopied] = React.useState(false);
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <span
      onClick={handleClick}
      title={path}
      style={{ cursor: 'pointer', color: copied ? token.colorSuccess : token.colorTextSecondary, fontFamily: 'monospace', fontSize: 12 }}
    >
      {label}{copied ? ' ✓' : ''}
    </span>
  );
}

// ---------- FileChangesBlock ----------

interface FileChangesBlockProps {
  sessionId: string;
  runId: string;
  fileChanges: FileChangeSummary[];
  token: ReturnType<typeof useToken>['token'];
}

function FileChangesBlock({ sessionId, runId, fileChanges, token }: FileChangesBlockProps) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const rollback = useMutateData<{ runId?: string; changeIds?: string[] }, { rolledBack: number; skipped: number; conflicts: unknown[] }>(
    `/v1/plugins/agents/sessions/${sessionId}/rollback`,
    'POST'
  );
  const approve = useMutateData<{ runId?: string; changeIds?: string[] }, { approved: number }>(
    `/v1/plugins/agents/sessions/${sessionId}/approve`,
    'POST'
  );

  const visible = fileChanges.filter((c) => !dismissed.has(c.changeId) && !c.approved);
  if (visible.length === 0) { return null; }

  const allApproved = visible.every((c) => c.approved);

  const handleRollback = () => {
    UIModalConfirm({
      title: 'Rollback changes?',
      content: `This will revert ${visible.length} ${pluralFiles(visible.length)} to the state before the agent run.`,
      okText: 'Rollback',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const result = await rollback.mutateAsync({ runId });
          if (result.conflicts?.length) {
            console.warn(`Rolled back: ${result.rolledBack}, skipped due to conflicts: ${result.skipped}`);
          }
          setDismissed(new Set(visible.map((c) => c.changeId)));
        } catch {
          console.error('Failed to rollback changes');
        }
      },
    });
  };

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ runId });
      setDismissed(new Set(visible.map((c) => c.changeId)));
    } catch {
      console.error('Failed to approve changes');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <StepDot color={token.colorSuccess} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <UITypographyText style={{ fontSize: 13, fontWeight: 500 }}>
            {visible.length} {pluralFiles(visible.length)} changed
          </UITypographyText>
          {!allApproved && (
            <UIFlex gap={4}>
              <button
                onClick={handleApprove}
                disabled={approve.isLoading || rollback.isLoading}
                title="Approve all changes"
                style={{
                  background: token.colorSuccessBg,
                  border: `1px solid ${token.colorSuccessBorder}`,
                  color: token.colorSuccess,
                  borderRadius: token.borderRadius,
                  padding: '2px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >✓</button>
              <button
                onClick={handleRollback}
                disabled={rollback.isLoading || approve.isLoading}
                title="Rollback all changes"
                style={{
                  background: token.colorErrorBg,
                  border: `1px solid ${token.colorErrorBorder}`,
                  color: token.colorError,
                  borderRadius: token.borderRadius,
                  padding: '2px 8px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >✕</button>
            </UIFlex>
          )}
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {visible.map((change) => (
            <FileChangeRow
              key={change.changeId}
              change={change}
              sessionId={sessionId}
              onDismiss={() => setDismissed((prev) => new Set([...prev, change.changeId]))}
              token={token}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- FileChangeRow ----------

interface FileChangeRowProps {
  change: FileChangeSummary;
  sessionId: string;
  onDismiss: () => void;
  token: ReturnType<typeof useToken>['token'];
}

function FileChangeRow({ change, sessionId, onDismiss, token }: FileChangeRowProps) {
  const [open, setOpen] = React.useState(false);
  const rollback = useMutateData<{ changeIds: string[] }, { rolledBack: number; skipped: number; conflicts: unknown[] }>(
    `/v1/plugins/agents/sessions/${sessionId}/rollback`,
    'POST'
  );
  const approve = useMutateData<{ changeIds: string[] }, { approved: number }>(
    `/v1/plugins/agents/sessions/${sessionId}/approve`,
    'POST'
  );

  const diffUrl = open ? `/v1/plugins/agents/sessions/${sessionId}/changes/${encodeURIComponent(change.changeId)}/diff` : '';
  const { data: diffData, isLoading: diffLoading, isError: diffError } = useData<{ diff: string }>(diffUrl, { enabled: open });

  const handleRollback = (e: React.MouseEvent) => {
    e.stopPropagation();
    UIModalConfirm({
      title: 'Rollback file?',
      content: change.filePath,
      okText: 'Rollback',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await rollback.mutateAsync({ changeIds: [change.changeId] });
          onDismiss();
        } catch {
          console.error('Failed to rollback file');
        }
      },
    });
  };

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    approve.mutateAsync({ changeIds: [change.changeId] }).then(onDismiss).catch(() => {
      console.error('Failed to approve file');
    });
  };

  const opTag = change.isNew
    ? <UITag color="success">new</UITag>
    : change.operation === 'delete'
    ? <UITag color="error">del</UITag>
    : <UITag color="blue">mod</UITag>;

  return (
    <li>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          cursor: 'pointer',
          padding: '2px 4px',
          borderRadius: token.borderRadiusSM,
          background: open ? token.colorFillSecondary : 'transparent',
        }}
      >
        {opTag}
        <span style={{ flex: 1, fontFamily: 'monospace', color: token.colorTextSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {change.filePath.split('/').pop() ?? change.filePath}
        </span>
        <span style={{ color: token.colorTextTertiary, fontFamily: 'monospace', fontSize: 11 }}>
          {change.filePath.includes('/') ? change.filePath.slice(0, change.filePath.lastIndexOf('/')) : ''}
        </span>
        {!change.approved && (
          <div style={{ display: 'flex', gap: 4 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <button
              onClick={handleApprove}
              disabled={approve.isLoading}
              title="Approve"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: token.colorSuccess, fontSize: 13, padding: '0 2px' }}
            >✓</button>
            <button
              onClick={handleRollback}
              disabled={rollback.isLoading}
              title="Rollback"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: token.colorError, fontSize: 13, padding: '0 2px' }}
            >✕</button>
          </div>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 4, marginLeft: 4 }}>
          {diffLoading && <UISpin size="small" />}
          {diffData?.diff && <DiffView diff={diffData.diff} token={token} />}
          {diffError && <span style={{ color: token.colorError, fontSize: 12 }}>Failed to load diff</span>}
        </div>
      )}
    </li>
  );
}

// ---------- TodoView ----------

interface TodoItemData {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high';
}

interface TodoListData {
  sessionId: string;
  items: TodoItemData[];
}

const TODO_STATUS_ICON: Record<string, string> = {
  'completed': '✓',
  'in-progress': '●',
  'blocked': '✕',
  'pending': '○',
};

function TodoView({ todoList, token }: { todoList?: TodoListData; token: ReturnType<typeof useToken>['token'] }) {
  if (!todoList?.items?.length) { return null; }
  const completed = todoList.items.filter((i) => i.status === 'completed').length;
  return (
    <div style={{
      marginTop: 6,
      background: token.colorFillTertiary,
      borderRadius: token.borderRadius,
      padding: '8px 10px',
    }}>
      <div style={{ fontSize: 11, color: token.colorTextTertiary, marginBottom: 6, fontWeight: 500 }}>
        {completed}/{todoList.items.length}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {todoList.items.map((item) => (
          <li key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, lineHeight: 1.5, padding: '2px 0' }}>
            <span style={{ fontSize: 12, flexShrink: 0, width: 14, textAlign: 'center', lineHeight: 1 }}>
              {TODO_STATUS_ICON[item.status] ?? '○'}
            </span>
            {item.status === 'completed' ? (
              <UITypographyText type="success" style={{ flex: 1, minWidth: 0, textDecoration: 'line-through' }}>{item.description}</UITypographyText>
            ) : item.status === 'pending' || item.status === 'blocked' ? (
              <UITypographyText type="secondary" style={{ flex: 1, minWidth: 0 }}>{item.description}</UITypographyText>
            ) : (
              <UITypographyText style={{ flex: 1, minWidth: 0 }}>{item.description}</UITypographyText>
            )}
            {item.priority !== 'medium' && (
              <UITypographyText type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>{item.priority}</UITypographyText>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Helpers ----------

interface ToolMeta {
  summary?: string;
  filePath?: string;
  badge?: string;
}

function getToolMeta(step: import('@kb-labs/agent-contracts').ToolUseStep): ToolMeta {
  const input = step.input as Record<string, unknown> | null | undefined;
  if (!input) { return {}; }

  const toolLower = step.toolName.toLowerCase();
  const isRead = toolLower.includes('read');
  const isWrite = toolLower.includes('write') || toolLower.includes('patch') || toolLower.includes('edit');

  const path = (input.path ?? input.filePath ?? input.file_path ?? input.file) as string | undefined;
  if (path) {
    const fileName = String(path).split('/').pop() ?? String(path);
    let badge: string | undefined;
    if (isRead) {
      const offset = input.offset ?? input.startLine ?? input.start_line;
      const limit = input.limit ?? input.endLine ?? input.end_line;
      if (offset !== undefined && limit !== undefined) { badge = `${offset}-${Number(offset) + Number(limit)}`; }
      else if (limit !== undefined) { badge = `${limit} lines`; }
    }
    return { summary: fileName, filePath: String(path), badge };
  }

  const query = (input.query ?? input.text ?? input.pattern ?? input.search) as string | undefined;
  if (query) { return { summary: String(query).slice(0, 100) }; }

  const command = (input.command ?? input.cmd) as string | undefined;
  if (command) { return { summary: String(command).slice(0, 100) }; }

  if (isWrite) { return {}; }

  const content = (input.content ?? input.message) as string | undefined;
  if (content) { return { summary: String(content).slice(0, 100) }; }

  return {};
}

function formatToolName(name: string): string {
  const normalized = name.trim().toLowerCase().replace(/[_-]/g, ' ');
  if (normalized.includes('fs read') || normalized.includes('read file')) { return 'Read'; }
  if (normalized.includes('fs write') || normalized.includes('write file')) { return 'Write'; }
  if (normalized.includes('fs patch') || normalized.includes('patch file')) { return 'Edit'; }
  if (normalized.includes('fs edit') || normalized.includes('edit file')) { return 'Edit'; }
  if (normalized.includes('fs delete') || normalized.includes('delete file') || normalized.includes('remove file')) { return 'Delete'; }
  if (normalized.includes('fs list') || normalized.includes('list files') || normalized.includes('glob')) { return 'Glob'; }
  if (normalized.includes('grep') || normalized.includes('search content')) { return 'Grep'; }
  if (normalized.includes('bash') || normalized.includes('exec') || normalized.includes('shell') || normalized.includes('run command')) { return 'Bash'; }
  if (normalized.includes('rag') || normalized.includes('mind')) { return 'Mind'; }
  if (normalized.includes('todo')) { return 'TodoWrite'; }

  const colonIdx = name.indexOf(':');
  const base = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
  return base
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isNoisyThinking(content: string): boolean {
  const t = content.trim().toLowerCase();
  if (t === '[executing tools...]' || t === '[thinking...]' || t === '[planning...]' || t === '[analyzing...]') { return true; }
  if (t === 'analyzing context and choosing the next step.') { return true; }
  if (t.startsWith('checking facts with tool:') || t.startsWith('running step with tool:') || t.startsWith('running the next step')) { return true; }
  if (t === 'done.' || t === 'ok.' || t === 'done' || t === 'ok') { return true; }
  return false;
}

function isInternalProgressText(content: string): boolean {
  return isNoisyThinking(content);
}

function pluralFiles(n: number): string {
  return n === 1 ? 'file' : 'files';
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') { return output.slice(0, 2000); }
  try { return JSON.stringify(output, null, 2).slice(0, 2000); }
  catch { return String(output).slice(0, 2000); }
}
