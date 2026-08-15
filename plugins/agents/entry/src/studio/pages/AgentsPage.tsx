import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useData, useMutateData, useWebSocket,
  UIInputTextArea, UIButton, UIMessage,
  UISegmented, UISwitch, UIPopover, UITypographyText, UIIcon, useUITheme,
} from '@kb-labs/sdk/studio';
import type { WebSocketStatus } from '@kb-labs/sdk/studio';
import { SessionSelector } from '../components/SessionSelector';
import { ConversationView } from '../components/ConversationView';
import type { AgentSessionInfo, Turn, AgentResponseMode, ServerMessage } from '@kb-labs/agent-contracts';

type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

interface RunRequest {
  task: string;
  agentId: string;
  sessionId?: string;
  tier: 'small' | 'medium' | 'large';
  enableEscalation: boolean;
  responseMode: AgentResponseMode;
  mode?: 'execute' | 'plan';
}

interface RunResponse {
  runId: string;
  sessionId: string;
}

interface StopRequest {
  reason?: string;
}

function compareTurns(a: Turn, b: Turn): number {
  if (a.sequence !== b.sequence) { return a.sequence - b.sequence; }
  if (a.type !== b.type) {
    if (a.type === 'user') { return -1; }
    if (b.type === 'user') { return 1; }
  }
  return a.startedAt.localeCompare(b.startedAt);
}

function buildAgentWsUrl(sessionId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/api/v1/ws/plugins/agents/session/${sessionId}`;
}

// ---------- ConnectionBadge ----------

function ConnectionBadge({
  status,
  sessionId,
  onReconnect,
}: {
  status: WebSocketStatus;
  sessionId: string | null;
  onReconnect: () => void;
}) {
  const { token } = useUITheme();
  if (!sessionId) { return null; }
  if (status === 'connected') { return null; }

  if (status === 'connecting') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <UIIcon name="LoadingOutlined" style={{ fontSize: 12, color: token.colorTextTertiary }} />
        <UITypographyText type="secondary" style={{ fontSize: 12 }}>Connecting...</UITypographyText>
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <UIIcon name="DisconnectOutlined" style={{ fontSize: 12, color: token.colorError }} />
      <UIButton
        variant="link"
        size="small"
        style={{ padding: 0, fontSize: 12, height: 'auto' }}
        onClick={onReconnect}
      >
        Reconnect
      </UIButton>
    </span>
  );
}

// ---------- ComposerSettings ----------

function ComposerSettings({
  responseMode,
  setResponseMode,
  tier,
  setTier,
  enableEscalation,
  setEnableEscalation,
  disabled,
  token,
}: {
  responseMode: AgentResponseMode;
  setResponseMode: (v: AgentResponseMode) => void;
  tier: 'small' | 'medium' | 'large';
  setTier: (v: 'small' | 'medium' | 'large') => void;
  enableEscalation: boolean;
  setEnableEscalation: (v: boolean) => void;
  disabled: boolean;
  token: ReturnType<typeof useUITheme>['token'];
}) {
  return (
    <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 14, padding: 4 }}>
      <div>
        <UITypographyText type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>RESPONSE</UITypographyText>
        <UISegmented
          block
          size="small"
          value={responseMode}
          onChange={(v) => setResponseMode(v as AgentResponseMode)}
          disabled={disabled}
          style={{ marginTop: 6 }}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'brief', label: 'Brief' },
            { value: 'deep', label: 'Deep' },
          ]}
        />
      </div>
      <div>
        <UITypographyText type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>MODEL TIER</UITypographyText>
        <UISegmented
          block
          size="small"
          value={tier}
          onChange={(v) => setTier(v as 'small' | 'medium' | 'large')}
          disabled={disabled}
          style={{ marginTop: 6 }}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ]}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <UITypographyText style={{ fontSize: 13 }}>Auto escalate</UITypographyText>
        <UISwitch
          checked={enableEscalation}
          onChange={setEnableEscalation}
          disabled={disabled || tier === 'large'}
          size="small"
        />
      </div>
      <UITypographyText type="secondary" style={{ fontSize: 11, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 8 }}>
        Escalates to a larger model when the task needs it.
      </UITypographyText>
    </div>
  );
}

function tierLabel(tier: 'small' | 'medium' | 'large'): string {
  return tier === 'small' ? 'Small' : tier === 'large' ? 'Large' : 'Medium';
}

// ---------- AgentsPage ----------

function AgentsPage() {
  const { token } = useUITheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    () => searchParams.get('session'),
  );
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(
    () => searchParams.get('session'),
  );

  const [task, setTask] = useState('');
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [optimisticUserTurns, setOptimisticUserTurns] = useState<Turn[]>([]);
  const [wsTurns, setWsTurns] = useState<Turn[]>([]);
  const [responseMode, setResponseMode] = useState<AgentResponseMode>('auto');
  const [tier, setTier] = useState<'small' | 'medium' | 'large'>('medium');
  const [enableEscalation, setEnableEscalation] = useState(true);
  const [agentMode, setAgentMode] = useState<'execute' | 'plan'>('execute');
  const [inputFocused, setInputFocused] = useState(false);

  const agentId = 'mind-assistant';
  const wsUrl = currentSessionId ? buildAgentWsUrl(currentSessionId) : null;

  const startRunMutation = useMutateData<RunRequest, RunResponse>('/v1/plugins/agents/run', 'POST');
  const stopMutation = useMutateData<StopRequest, unknown>(
    currentRunId ? `/v1/plugins/agents/run/${currentRunId}/stop` : '/v1/plugins/agents/run/noop/stop',
    'POST',
  );

  const sessionTurnsUrl = currentSessionId ? `/v1/plugins/agents/sessions/${currentSessionId}/turns` : '';
  const {
    data: sessionTurnsData,
    isFetching: turnsFetching,
    isError: turnsError,
    refetch: refetchTurns,
  } = useData<{ turns: Turn[]; total: number }>(sessionTurnsUrl, { enabled: !!currentSessionId });

  useEffect(() => {
    if (currentSessionId && (sessionTurnsData || turnsError) && !turnsFetching) {
      setLoadedSessionId(currentSessionId);
    }
  }, [currentSessionId, sessionTurnsData, turnsError, turnsFetching]);

  const ws = useWebSocket<unknown, ServerMessage>(wsUrl, {
    reconnect: true,
    maxReconnects: 10,
    reconnectIntervalMs: 2000,
    onMessage: (data) => {
      switch (data.type) {
        case 'conversation:snapshot': {
          const all = [...data.payload.completedTurns, ...data.payload.activeTurns]
            .sort((a, b) => a.sequence - b.sequence);
          setWsTurns(all);
          break;
        }
        case 'turn:snapshot': {
          const { turn } = data.payload;
          setWsTurns((prev) => {
            const idx = prev.findIndex((t) => t.id === turn.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = turn;
              return next;
            }
            return [...prev, turn].sort((a, b) => a.sequence - b.sequence);
          });
          break;
        }
        case 'run:completed': {
          const { success, summary } = data.payload;
          setRunStatus(success ? 'completed' : 'failed');
          void refetchTurns();
          console.log('[AgentsPage] Run completed:', summary);
          break;
        }
        case 'error': {
          const { code, message } = data.payload;
          UIMessage.error(`Agent error [${code}]: ${message}`);
          break;
        }
      }
    },
  });

  // Auto-scroll to bottom on new turns
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [wsTurns.length, optimisticUserTurns.length]);

  const handleSessionChange = useCallback((sessionId: string, _session: AgentSessionInfo) => {
    setCurrentSessionId(sessionId);
    setLoadedSessionId(null);
    setSearchParams({ session: sessionId }, { replace: true });
    setCurrentRunId(null);
    setRunStatus('idle');
    setOptimisticUserTurns([]);
    setWsTurns([]);
    ws.clear();
  }, [ws, setSearchParams]);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    setLoadedSessionId(null);
    setSearchParams({}, { replace: true });
    setCurrentRunId(null);
    setRunStatus('idle');
    setOptimisticUserTurns([]);
    setWsTurns([]);
    ws.clear();
  }, [ws, setSearchParams]);

  const handleStart = useCallback(async () => {
    if (!task.trim()) { return; }

    const userMessage = task.trim();
    setTask('');
    setRunStatus('running');

    const knownSequences = [
      ...(sessionTurnsData?.turns ?? []).map((t) => t.sequence),
      ...wsTurns.map((t) => t.sequence),
      ...optimisticUserTurns.map((t) => t.sequence),
    ];
    const nextSequence = (knownSequences.length ? Math.max(...knownSequences) : 0) + 0.5;

    const optimisticTurn: Turn = {
      id: `optimistic-user-${Date.now()}`,
      type: 'user',
      sequence: nextSequence,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'completed',
      steps: [{ type: 'text', id: 'opt-1', timestamp: new Date().toISOString(), content: userMessage, role: 'user' }],
      metadata: { agentId: 'user' },
    };
    setOptimisticUserTurns((prev) => [...prev, optimisticTurn]);

    try {
      const response = await startRunMutation.mutateAsync({
        task: userMessage,
        agentId,
        sessionId: currentSessionId ?? undefined,
        tier,
        enableEscalation,
        responseMode,
        mode: agentMode,
      });

      if (!currentSessionId) {
        setCurrentSessionId(response.sessionId);
        setLoadedSessionId(response.sessionId);
        setSearchParams({ session: response.sessionId }, { replace: true });
      }

      setCurrentRunId(response.runId);
    } catch (error) {
      setOptimisticUserTurns((prev) => prev.filter((t) => t.id !== optimisticTurn.id));
      setRunStatus('failed');
      UIMessage.error(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [
    task, agentId, currentSessionId, tier, enableEscalation,
    responseMode, agentMode, setSearchParams, startRunMutation,
    sessionTurnsData, wsTurns, optimisticUserTurns,
  ]);

  const handleStop = useCallback(async () => {
    if (!currentRunId) { return; }
    try {
      await stopMutation.mutateAsync({ reason: 'Stopped by user' });
      setRunStatus('stopped');
      UIMessage.info('Stopped');
    } catch (error) {
      UIMessage.error(`Failed to stop: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [currentRunId, stopMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && runStatus !== 'running' && !startRunMutation.isLoading) {
      e.preventDefault();
      void handleStart();
    }
  };

  const isRunning = runStatus === 'running' || startRunMutation.isLoading;
  const isSwitchingSession = currentSessionId !== null && currentSessionId !== loadedSessionId;

  const turns = (() => {
    if (isSwitchingSession) { return []; }

    const restTurns = sessionTurnsData?.turns ?? [];
    const merged = new Map<string, Turn>();

    for (const t of restTurns) { merged.set(t.id, t); }
    for (const t of wsTurns) {
      const existing = merged.get(t.id);
      // A REST refetch (after run:completed) is authoritative; don't let a stale
      // "streaming" WS snapshot resurrect a turn that's already been finalized.
      if (existing && existing.status !== 'streaming' && t.status === 'streaming') { continue; }
      merged.set(t.id, t);
    }

    const serverUserTexts = new Set(
      [...merged.values()]
        .filter((t) => t.type === 'user')
        .flatMap((t) => t.steps.filter((s) => s.type === 'text').map((s) => s.content?.trim()))
        .filter(Boolean),
    );
    for (const t of optimisticUserTurns) {
      const text = t.steps.find((s) => s.type === 'text')?.content?.trim();
      if (text && !serverUserTexts.has(text)) { merged.set(t.id, t); }
    }

    return [...merged.values()].sort(compareTurns);
  })();

  const turnsWithThinkingLoader: Turn[] = (() => {
    if (!isRunning) { return turns; }

    const hasActiveAssistant = turns.some((t) => t.type === 'assistant' && t.status === 'streaming');
    if (hasActiveAssistant) { return turns; }

    const lastUserTurn = [...turns].reverse().find((t) => t.type === 'user');
    if (!lastUserTurn) { return turns; }

    const hasCompletedAssistantAfterUser = turns.some(
      (t) => t.type === 'assistant' && t.status === 'completed' && t.sequence > lastUserTurn.sequence,
    );
    if (hasCompletedAssistantAfterUser) { return turns; }

    const loaderTurn: Turn = {
      id: `thinking-loader-${lastUserTurn.id}`,
      type: 'assistant',
      sequence: lastUserTurn.sequence + 0.1,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'streaming',
      steps: [],
      metadata: { agentId: 'assistant-loader' },
    };

    return [...turns, loaderTurn].sort(compareTurns);
  })();

  const isLoading = isSwitchingSession || (turnsFetching && turns.length === 0 && !!currentSessionId);
  const canSend = !!task.trim() && !startRunMutation.isLoading;

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 28, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: token.colorBgContainer }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UIIcon name="RobotOutlined" style={{ fontSize: 15, color: token.colorTextSecondary }} />
          <UITypographyText strong style={{ fontSize: 14 }}>Agent</UITypographyText>
        </div>
        <SessionSelector
          currentSessionId={currentSessionId}
          onSessionChange={handleSessionChange}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Conversation */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
          <ConversationView
            turns={turnsWithThinkingLoader}
            isLoading={isLoading}
            isError={turnsError}
            onRetry={() => void refetchTurns()}
            sessionId={currentSessionId}
          />
        </div>
      </div>

      {/* Composer */}
      <div style={{ padding: '0 20px 18px', flexShrink: 0 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', width: '100%' }}>
          <div
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={{
              border: `1px solid ${inputFocused ? token.colorPrimary : token.colorBorderSecondary}`,
              borderRadius: 20,
              background: token.colorBgContainer,
              boxShadow: inputFocused
                ? `0 0 0 3px ${token.colorPrimaryBg}`
                : '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
              overflow: 'hidden',
            }}
          >
            <UIInputTextArea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the agent..."
              autoSize={{ minRows: 1, maxRows: 8 }}
              disabled={isRunning}
              variant="borderless"
              style={{ resize: 'none', padding: '14px 16px 6px', border: 'none', boxShadow: 'none', outline: 'none', fontSize: 14 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <UISegmented
                  size="small"
                  value={agentMode}
                  onChange={(v) => setAgentMode(v as 'execute' | 'plan')}
                  disabled={isRunning}
                  options={[
                    { value: 'execute', label: 'Execute' },
                    { value: 'plan', label: 'Plan' },
                  ]}
                />
                <UIPopover
                  trigger="click"
                  placement="topLeft"
                  content={
                    <ComposerSettings
                      responseMode={responseMode}
                      setResponseMode={setResponseMode}
                      tier={tier}
                      setTier={setTier}
                      enableEscalation={enableEscalation}
                      setEnableEscalation={setEnableEscalation}
                      disabled={isRunning}
                      token={token}
                    />
                  }
                >
                  <button
                    disabled={isRunning}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 10px',
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 999,
                      background: 'transparent',
                      cursor: isRunning ? 'default' : 'pointer',
                      opacity: isRunning ? 0.6 : 1,
                      fontFamily: 'inherit',
                      fontSize: 12,
                      color: token.colorTextSecondary,
                    }}
                  >
                    <UIIcon name="ControlOutlined" style={{ fontSize: 11 }} />
                    <span>{tierLabel(tier)}</span>
                    {enableEscalation && <span style={{ color: token.colorTextTertiary }}>· Auto</span>}
                  </button>
                </UIPopover>
                <ConnectionBadge
                  status={ws.status}
                  sessionId={currentSessionId}
                  onReconnect={() => ws.connect()}
                />
              </div>
              <div>
                {isRunning ? (
                  <button
                    onClick={handleStop}
                    disabled={stopMutation.isLoading}
                    title="Stop"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      border: 'none',
                      background: token.colorError,
                      color: token.colorTextLightSolid,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: stopMutation.isLoading ? 'default' : 'pointer',
                    }}
                  >
                    <UIIcon name={stopMutation.isLoading ? 'LoadingOutlined' : 'StopOutlined'} style={{ fontSize: 13, color: 'inherit' }} />
                  </button>
                ) : (
                  <button
                    onClick={handleStart}
                    disabled={!canSend}
                    title="Send"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      border: 'none',
                      background: canSend ? token.colorText : token.colorFillTertiary,
                      color: canSend ? token.colorBgContainer : token.colorTextQuaternary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: canSend ? 'pointer' : 'default',
                      transition: 'background 0.15s',
                    }}
                  >
                    <UIIcon name={startRunMutation.isLoading ? 'LoadingOutlined' : 'ArrowUpOutlined'} style={{ fontSize: 13, color: 'inherit' }} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentsPage;
