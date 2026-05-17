import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useData, useMutateData, useWebSocket,
  UIInputTextArea, UIButton, UISpace, UIMessage, UICard,
  UISelect, UISwitch, UITypographyText, UIIcon, useUITheme,
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
      <UISpace size={4}>
        <UIIcon name="LoadingOutlined" style={{ fontSize: 12, color: token.colorTextTertiary }} />
        <UITypographyText type="secondary" style={{ fontSize: 12 }}>Connecting...</UITypographyText>
      </UISpace>
    );
  }

  return (
    <UISpace size={4}>
      <UIIcon name="DisconnectOutlined" style={{ fontSize: 12, color: token.colorError }} />
      <UIButton
        variant="link"
        size="small"
        style={{ padding: 0, fontSize: 12, height: 'auto' }}
        onClick={onReconnect}
      >
        Reconnect
      </UIButton>
    </UISpace>
  );
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
          setOptimisticUserTurns([]);
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
          setOptimisticUserTurns([]);
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

    const optimisticTurn: Turn = {
      id: `optimistic-user-${Date.now()}`,
      type: 'user',
      sequence: 9999,
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

      // If WS already connected, clear optimistic after short delay as a safety net
      if (ws.isConnected) {
        setTimeout(() => setOptimisticUserTurns([]), 500);
      }
    } catch (error) {
      setOptimisticUserTurns((prev) => prev.filter((t) => t.id !== optimisticTurn.id));
      setRunStatus('failed');
      UIMessage.error(`Failed to start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [
    task, agentId, currentSessionId, tier, enableEscalation,
    responseMode, agentMode, setSearchParams, startRunMutation, ws,
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

    if (wsTurns.length === 0) {
      for (const t of restTurns) { merged.set(t.id, t); }
    } else {
      for (const t of restTurns) { merged.set(t.id, t); }
      for (const t of wsTurns) { merged.set(t.id, t); }
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

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
    <UICard
      title={
        <UISpace>
          <UIIcon name="RobotOutlined" />
          <span>Agent</span>
        </UISpace>
      }
      extra={
        <SessionSelector
          currentSessionId={currentSessionId}
          onSessionChange={handleSessionChange}
          onNewChat={handleNewChat}
        />
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{
        body: {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
        },
      }}
    >
      <div ref={scrollContainerRef} style={{ flex: 1, overflow: 'auto' }}>
        <ConversationView
          turns={turnsWithThinkingLoader}
          isLoading={isLoading}
          isError={turnsError}
          onRetry={() => void refetchTurns()}
          sessionId={currentSessionId}
        />
      </div>

      <div
        style={{
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          padding: '12px 16px',
          background: token.colorBgContainer,
        }}
      >
        <div
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          style={{
            border: `1px solid ${
              inputFocused
                ? (agentMode === 'execute' ? token.colorError : token.colorPrimary)
                : (agentMode === 'plan' ? token.colorPrimary : token.colorBorder)
            }`,
            borderRadius: token.borderRadiusLG,
            background: token.colorBgContainer,
            boxShadow: inputFocused
              ? `0 0 0 2px ${agentMode === 'execute' ? token.colorErrorBg : token.colorPrimaryBg}`
              : 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
            overflow: 'hidden',
          }}
        >
          <UIInputTextArea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            autoSize={{ minRows: 2, maxRows: 8 }}
            disabled={isRunning}
            variant="borderless"
            style={{ resize: 'none', padding: '10px 12px 4px', border: 'none', boxShadow: 'none', outline: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px 8px' }}>
            <UISpace size={6}>
              <ConnectionBadge
                status={ws.status}
                sessionId={currentSessionId}
                onReconnect={() => ws.connect()}
              />
              <UISelect
                value={agentMode}
                onChange={(v) => setAgentMode(v as 'execute' | 'plan')}
                disabled={isRunning}
                size="small"
                variant="borderless"
                style={{ width: 110 }}
                options={[
                  { value: 'execute', label: 'Execute' },
                  { value: 'plan', label: 'Plan' },
                ]}
              />
              <UISelect
                value={responseMode}
                onChange={(v) => setResponseMode(v as AgentResponseMode)}
                disabled={isRunning}
                size="small"
                variant="borderless"
                style={{ width: 80 }}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'brief', label: 'Brief' },
                  { value: 'deep', label: 'Deep' },
                ]}
              />
              <UISelect
                value={tier}
                onChange={(v) => setTier(v as 'small' | 'medium' | 'large')}
                disabled={isRunning}
                size="small"
                variant="borderless"
                style={{ width: 100 }}
                options={[
                  { value: 'small', label: 'Small' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'large', label: 'Large' },
                ]}
              />
              <UISpace size={4} align="center">
                <UISwitch
                  checked={enableEscalation}
                  onChange={setEnableEscalation}
                  disabled={isRunning || tier === 'large'}
                  size="small"
                />
                <UITypographyText type="secondary" style={{ fontSize: 12 }}>
                  Auto escalate
                </UITypographyText>
              </UISpace>
            </UISpace>
            <div>
              {isRunning ? (
                <UIButton
                  danger
                  size="small"
                  icon={stopMutation.isLoading ? <UIIcon name="LoadingOutlined" /> : <UIIcon name="StopOutlined" />}
                  onClick={handleStop}
                  disabled={stopMutation.isLoading}
                >
                  Stop
                </UIButton>
              ) : (
                <UIButton
                  variant="primary"
                  size="small"
                  icon={startRunMutation.isLoading ? <UIIcon name="LoadingOutlined" /> : <UIIcon name="SendOutlined" />}
                  onClick={handleStart}
                  disabled={!task.trim() || startRunMutation.isLoading}
                >
                  Send
                </UIButton>
              )}
            </div>
          </div>
        </div>
      </div>
    </UICard>
    </div>
  );
}

export default AgentsPage;
