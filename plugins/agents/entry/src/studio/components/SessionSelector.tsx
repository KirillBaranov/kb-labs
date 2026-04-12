/**
 * Session selector component for Agent widget
 */

import React from 'react';
import { useData, UISelect, UIButton, UISpace, UITypographyText, UISpin, UITooltip, UIIcon, useUITheme } from '@kb-labs/sdk/studio';
import type { AgentSessionInfo } from '@kb-labs/agent-contracts';

interface SessionSelectorProps {
  currentSessionId: string | null;
  onSessionChange: (sessionId: string, session: AgentSessionInfo) => void;
  onNewChat: () => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) { return 'just now'; }
  if (diffMins < 60) { return `${diffMins}m ago`; }
  if (diffHours < 24) { return `${diffHours}h ago`; }
  if (diffDays < 7) { return `${diffDays}d ago`; }
  return date.toLocaleDateString();
}

export function SessionSelector({
  currentSessionId,
  onSessionChange,
  onNewChat,
}: SessionSelectorProps) {
  const { token } = useUITheme();
  const { data: sessionsData, isLoading } = useData<{ sessions: AgentSessionInfo[]; total: number }>(
    '/v1/plugins/agents/sessions?limit=20',
  );

  const sessions = sessionsData?.sessions ?? [];

  const handleSessionSelect = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      onSessionChange(sessionId, session);
    }
  };

  return (
    <UISpace size="small" style={{ width: '100%' }}>
      <UIIcon name="HistoryOutlined" style={{ color: token.colorTextTertiary }} />

      <UISelect
        style={{ flex: 1, minWidth: 200 }}
        placeholder="New chat"
        value={currentSessionId ?? undefined}
        onChange={(v) => handleSessionSelect(v as string)}
        loading={isLoading}
        allowClear
        onClear={onNewChat}
        notFoundContent={
          isLoading ? (
            <UISpin size="small" />
          ) : (
            <UITypographyText type="secondary">No sessions yet</UITypographyText>
          )
        }
        optionLabelProp="label"
        options={sessions.map((session) => ({
          value: session.id,
          label: session.name || session.task || 'Untitled',
          lastActivityAt: session.lastActivityAt,
        }))}
        optionRender={(option) => (
          <UISpace style={{ width: '100%', justifyContent: 'space-between' }}>
            <UITypographyText ellipsis style={{ maxWidth: 180 }}>
              {option.label}
            </UITypographyText>
            <UITypographyText type="secondary" style={{ fontSize: 11 }}>
              {formatRelativeTime(option.data.lastActivityAt)}
            </UITypographyText>
          </UISpace>
        )}
      />

      <UITooltip title="New Chat">
        <UIButton
          variant="primary"
          icon={<UIIcon name="PlusOutlined" />}
          onClick={onNewChat}
        />
      </UITooltip>
    </UISpace>
  );
}
