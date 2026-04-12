/**
 * Agent chat page — Module Federation widget
 * Turn-based agent UI with snapshot-based architecture
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData, useMutateData, UIInputTextArea, UIButton, UISpace, UIMessage, UICard, UISelect, UISwitch, UITypographyText, UIIcon, useUITheme } from '@kb-labs/sdk/studio';
import { useAgentWebSocket, buildAgentWsUrl } from '../hooks/use-agent-websocket';
import { SessionSelector } from '../components/SessionSelector';
import { ConversationView } from '../components/ConversationView';
import type { AgentSessionInfo, Turn, AgentResponseMode } from '@kb-labs/agent-contracts';


type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'stopped';

interface RunRequest {
  task: string;
  agentId: string;
  sessionId?: string;
  tier: 'small' | 'medium' | 'large';
  enableEscalation: boolean;
  responseMode: AgentResponseMode;
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

function AgentsPage() {
  const { token } = useUITheme();
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    () => searchParams.get('session')
  );
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(
    () => searchParams.get('session')
  );

  const [task, setTask] = useState('');
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [optimisticUserTurns, setOptimisticUserTurns] = useState<Turn[]>([]);
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
    'POST'
  );

  const sessionTurnsUrl = currentSessionId ? `/v1/plugins/agents/sessions/${currentSessionId}/turns` : '';
  const { data: sessionTurnsData, isFetching: turnsFetching, refetch: refetchTurns } = useData<{ turns: Turn[]; total: number }>(
    sessionTurnsUrl,
    { enabled: !!currentSessionId },
  );

  useEffect(() => {
    if (currentSessionId && sessionTurnsData && !turnsFetching) {
      setLoadedSessionId(currentSessionId);
    }
  }, [currentSessionId, sessionTurnsData, turnsFetching]);

  const ws = useAgentWebSocket({
    url: wsUrl,
    onComplete: (success, summary) => {
      setRunStatus(success ? 'completed' : 'failed');
      void refetchTurns();
      console.log('[AgentsPage] Run completed:', summary);
    },
    onTurnsChanged: () => {
      setOptimisticUserTurns([]);
    },
    onError: (error) => {
      console.error('[AgentsPage] WebSocket error:', error);
      UIMessage.error(`Connection error: ${error.message}`);
    },
  });

  const handleSessionChange = useCallback((sessionId: string, _session: AgentSessionInfo) => {
    setCurrentSessionId(sessionId);
    setLoadedSessionId(null);
    setSearchParams({ session: sessionId }, { replace: true });
    setCurrentRunId(null);
    setRunStatus('idle');
    setOptimisticUserTurns([]);
    ws.clearTurns();
  }, [ws, setSearchParams]);

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    setLoadedSessionId(null);
    setSearchParams({}, { replace: true });
    setCurrentRunId(null);
    setRunStatus('idle');
    setOptimisticUserTurns([]);
    ws.clearTurns();
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
    task,
    agentId,
    currentSessionId,
    tier,
    enableEscalation,
    responseMode,
    setSearchParams,
    startRunMutation,
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
    const wsTurns = ws.turns;

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
        .filter(Boolean)
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
      (t) => t.type === 'assistant' && t.status === 'completed' && t.sequence > lastUserTurn.sequence
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
    <div style={{ padding: 16, height: '100%' }}>
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
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
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
        <div
          ref={scrollContainerRef}
          style={{ flex: 1, overflow: 'auto' }}
        >
          <ConversationView
            turns={turnsWithThinkingLoader}
            isLoading={isLoading}
            sessionId={currentSessionId}
          />
        </div>

        <div
          style={{
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            padding: '12px 16px',
            background: token.colorBgContainer,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            style={{
              width: '65%',
              maxWidth: 780,
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
