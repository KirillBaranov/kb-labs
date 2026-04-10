import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  UICard,
  UIInputTextArea,
  UIButton,
  UITypographyText,
  UITypographyParagraph,
  UISpace,
  UISpaceCompact,
  UITag,
  UISpin,
  UIStatistic,
  UICheckbox,
  UISelect,
  UITooltip,
  UIMessage,
} from '@kb-labs/studio-ui-kit';
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  BulbOutlined,
  CopyOutlined,
  CheckOutlined,
  ReloadOutlined,
  SettingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useDataSources } from '../../../providers/data-sources-provider';
import { usePrometheusMetrics, useIncidents } from '@kb-labs/studio-data-client';
import { UIMarkdownViewer } from '@kb-labs/studio-ui-kit';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  context?: string[];
  thinking?: boolean;
}

interface ContextConfig {
  includeMetrics: boolean;
  includeIncidents: boolean;
  includeHistory: boolean;
  timeRange: '1h' | '6h' | '24h' | '7d';
  plugins: string[];
}

const SUGGESTED_QUESTIONS = [
  { text: 'Why is latency higher than usual?', category: 'Performance' },
  { text: 'Which plugin should I optimize first?', category: 'Optimization' },
  { text: 'Are there any anomalies in the last 24 hours?', category: 'Anomalies' },
  { text: 'What caused the recent error spike?', category: 'Errors' },
  { text: 'How is the system health compared to yesterday?', category: 'Health' },
  { text: 'What are the most resource-intensive operations?', category: 'Resources' },
];

const TIME_RANGE_OPTIONS = [
  { value: '1h', label: 'Last 1 hour' },
  { value: '6h', label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
];

/**
 * AI Insights Page
 *
 * Full-featured chat interface for AI-powered system analysis.
 * Uses real metrics, incidents, and historical data as context for LLM.
 */
export function AIInsightsPage() {
  const sources = useDataSources();
  const { data: metrics, isLoading: metricsLoading } = usePrometheusMetrics(sources.observability);
  const { data: incidents } = useIncidents(sources.observability, { limit: 10 });

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [contextConfig, setContextConfig] = useState<ContextConfig>({
    includeMetrics: true,
    includeIncidents: true,
    includeHistory: true,
    timeRange: '24h',
    plugins: [],
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build context summary for display
  const contextSummary = React.useMemo(() => {
    if (!metrics) {return null;}

    const errorRate = metrics.requests?.total
      ? (((metrics.requests.clientErrors ?? 0) + (metrics.requests.serverErrors ?? 0)) / metrics.requests.total * 100)
      : 0;

    return {
      requests: metrics.requests?.total ?? 0,
      errorRate: errorRate.toFixed(2),
      p99Latency: metrics.latency?.p99?.toFixed(0) ?? 'N/A',
      pluginCount: metrics.perPlugin?.length ?? 0,
      incidentCount: incidents?.length ?? 0,
    };
  }, [metrics, incidents]);

  // Get available plugins for context filtering
  const availablePlugins = React.useMemo(() => {
    return metrics?.perPlugin?.map(p => p.pluginId) ?? [];
  }, [metrics]);

  // Generate AI response via backend API
  const generateResponse = useCallback(async (question: string): Promise<string> => {
    const response = await sources.observability.chatWithInsights(question, contextConfig);
    return response.answer;
  }, [sources.observability, contextConfig]);

  // Send message
  const handleSend = async () => {
    if (!input.trim() || isLoading) {return;}

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    const loadingMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      thinking: true,
      context: [
        contextConfig.includeMetrics ? 'metrics' : '',
        contextConfig.includeIncidents ? 'incidents' : '',
        contextConfig.includeHistory ? 'history' : '',
      ].filter(Boolean),
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await generateResponse(userMessage.content);

      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMessage.id
            ? { ...m, content: response, thinking: false }
            : m
        )
      );
    } catch (_error) {
      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMessage.id
            ? { ...m, content: 'Sorry, I encountered an error analyzing your request. Please try again.', thinking: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Copy message to clipboard
  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    UIMessage.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Handle suggested question click
  const handleSuggestion = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  // Clear conversation
  const handleClear = () => {
    setMessages([]);
  };

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 280px)', minHeight: 500 }}>
      {/* Main Chat Panel */}
      <UICard
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' } }}
        title={
          <UISpace>
            <RobotOutlined />
            <span>AI Assistant</span>
            {metricsLoading && <UISpin size="small" />}
          </UISpace>
        }
        extra={
          <UISpace>
            <UITooltip title="Clear conversation">
              <UIButton icon={<ReloadOutlined />} onClick={handleClear} disabled={messages.length === 0} />
            </UITooltip>
            <UITooltip title="Configure context">
              <UIButton
                icon={<SettingOutlined />}
                onClick={() => setShowConfig(!showConfig)}
                variant={showConfig ? 'primary' : 'default'}
              />
            </UITooltip>
          </UISpace>
        }
      >
        {/* Messages Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
              <RobotOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
              <UITypographyText type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                Ask me anything about your system's performance, errors, or health.
                I'll analyze real-time metrics and provide actionable insights.
              </UITypographyText>

              <div style={{ marginTop: 24 }}>
                <UITypographyText strong style={{ display: 'block', marginBottom: 12 }}>
                  <BulbOutlined /> Suggested questions:
                </UITypographyText>
                <UISpace wrap style={{ justifyContent: 'center' }}>
                  {SUGGESTED_QUESTIONS.map((q, i) => (
                    <UITag
                      key={i}
                      color="blue"
                      style={{ cursor: 'pointer', padding: '4px 12px' }}
                      onClick={() => handleSuggestion(q.text)}
                    >
                      {q.text}
                    </UITag>
                  ))}
                </UISpace>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '80%',
                      padding: '12px 16px',
                      borderRadius: 12,
                      background: msg.role === 'user' ? '#1890ff' : '#f5f5f5',
                      color: msg.role === 'user' ? '#fff' : '#000',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      {msg.role === 'assistant' && (
                        <RobotOutlined style={{ marginTop: 4, color: '#1890ff' }} />
                      )}
                      <div style={{ flex: 1 }}>
                        {msg.thinking ? (
                          <UISpace>
                            <UISpin size="small" />
                            <UITypographyText type="secondary">Analyzing...</UITypographyText>
                          </UISpace>
                        ) : msg.role === 'assistant' ? (
                          <UIMarkdownViewer content={msg.content} className="ai-insights-markdown" />
                        ) : (
                          <UITypographyParagraph
                            style={{
                              margin: 0,
                              whiteSpace: 'pre-wrap',
                              color: '#fff',
                            }}
                          >
                            {msg.content}
                          </UITypographyParagraph>
                        )}
                        {msg.context && msg.context.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {msg.context.map(c => (
                              <UITag key={c} color="default" style={{ fontSize: 10 }}>
                                {c}
                              </UITag>
                            ))}
                          </div>
                        )}
                      </div>
                      {msg.role === 'user' && <UserOutlined style={{ marginTop: 4 }} />}
                    </div>
                    {msg.role === 'assistant' && !msg.thinking && (
                      <div style={{ marginTop: 8, textAlign: 'right' }}>
                        <UIButton
                          variant="text"
                          size="small"
                          icon={copiedId === msg.id ? <CheckOutlined /> : <CopyOutlined />}
                          onClick={() => handleCopy(msg.content, msg.id)}
                          style={{ color: '#8c8c8c' }}
                        >
                          {copiedId === msg.id ? 'Copied' : 'Copy'}
                        </UIButton>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
          <UISpaceCompact style={{ width: '100%' }}>
            <UIInputTextArea
              ref={inputRef}
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              placeholder="Ask about your system..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              onPressEnter={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              style={{ flex: 1 }}
            />
            <UIButton
              variant="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={isLoading}
              disabled={!input.trim()}
            >
              Send
            </UIButton>
          </UISpaceCompact>
          <UITypographyText type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
            Press Enter to send, Shift+Enter for new line
          </UITypographyText>
        </div>
      </UICard>

      {/* Context Panel */}
      <UICard
        title={
          <UISpace>
            <InfoCircleOutlined />
            <span>Context</span>
          </UISpace>
        }
        style={{ width: 320, flexShrink: 0 }}
        styles={{ body: { padding: 16 } }}
      >
        {/* System Summary */}
        {contextSummary && (
          <div style={{ marginBottom: 24 }}>
            <UITypographyText strong style={{ display: 'block', marginBottom: 12 }}>System Summary</UITypographyText>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <UIStatistic title="Requests" value={contextSummary.requests} valueStyle={{ fontSize: 18 }} />
              <UIStatistic
                title="Error Rate"
                value={contextSummary.errorRate}
                suffix="%"
                valueStyle={{
                  fontSize: 18,
                  color: parseFloat(contextSummary.errorRate) > 5 ? '#ff4d4f' : parseFloat(contextSummary.errorRate) > 1 ? '#faad14' : '#52c41a',
                }}
              />
              <UIStatistic title="P99 Latency" value={contextSummary.p99Latency} suffix="ms" valueStyle={{ fontSize: 18 }} />
              <UIStatistic title="Incidents" value={contextSummary.incidentCount} valueStyle={{ fontSize: 18 }} />
            </div>
          </div>
        )}

        {/* Recent Incidents */}
        {incidents && incidents.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <UITypographyText strong style={{ display: 'block', marginBottom: 12 }}>Recent Incidents</UITypographyText>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {incidents.slice(0, 5).map(incident => (
                <div
                  key={incident.id}
                  style={{
                    padding: 8,
                    background: '#fafafa',
                    borderRadius: 4,
                    borderLeft: `3px solid ${
                      incident.severity === 'critical' ? '#ff4d4f' :
                      incident.severity === 'warning' ? '#faad14' : '#1890ff'
                    }`,
                  }}
                >
                  <UITypographyText style={{ fontSize: 12 }}>{incident.title}</UITypographyText>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Context Configuration */}
        {showConfig && (
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <UITypographyText strong style={{ display: 'block', marginBottom: 12 }}>Context Settings</UITypographyText>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <UICheckbox
                checked={contextConfig.includeMetrics}
                onChange={(checked) => setContextConfig(prev => ({ ...prev, includeMetrics: checked }))}
              >
                Include current metrics
              </UICheckbox>
              <UICheckbox
                checked={contextConfig.includeIncidents}
                onChange={(checked) => setContextConfig(prev => ({ ...prev, includeIncidents: checked }))}
              >
                Include incidents
              </UICheckbox>
              <UICheckbox
                checked={contextConfig.includeHistory}
                onChange={(checked) => setContextConfig(prev => ({ ...prev, includeHistory: checked }))}
              >
                Include historical trends
              </UICheckbox>

              <div>
                <UITypographyText type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                  Time Range
                </UITypographyText>
                <UISelect
                  value={contextConfig.timeRange}
                  onChange={value => setContextConfig(prev => ({ ...prev, timeRange: value as ContextConfig['timeRange'] }))}
                  options={TIME_RANGE_OPTIONS}
                  style={{ width: '100%' }}
                  size="small"
                />
              </div>

              {availablePlugins.length > 0 && (
                <div>
                  <UITypographyText type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                    Focus on plugins
                  </UITypographyText>
                  <UISelect
                    mode="multiple"
                    value={contextConfig.plugins}
                    onChange={value => setContextConfig(prev => ({ ...prev, plugins: value as string[] }))}
                    options={availablePlugins.map(p => ({ value: p, label: p }))}
                    style={{ width: '100%' }}
                    size="small"
                    placeholder="All plugins"
                    maxTagCount={2}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Suggested Questions */}
        <div style={{ marginTop: 24 }}>
          <UITypographyText strong style={{ display: 'block', marginBottom: 12 }}>
            <BulbOutlined /> Quick Questions
          </UITypographyText>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
              <UIButton
                key={i}
                variant="text"
                size="small"
                style={{ textAlign: 'left', height: 'auto', padding: '4px 8px' }}
                onClick={() => handleSuggestion(q.text)}
              >
                <UITypographyText ellipsis style={{ fontSize: 12 }}>{q.text}</UITypographyText>
              </UIButton>
            ))}
          </div>
        </div>
      </UICard>

      {/* Custom styles for markdown in chat context */}
      <style>{`
        .ai-insights-markdown {
          padding: 0;
          background: transparent;
          border-radius: 0;
        }
        .ai-insights-markdown p {
          margin: 0 0 8px 0;
        }
        .ai-insights-markdown p:last-child {
          margin-bottom: 0;
        }
        .ai-insights-markdown h1,
        .ai-insights-markdown h2,
        .ai-insights-markdown h3 {
          margin-top: 12px;
          margin-bottom: 8px;
          font-size: 1em;
          font-weight: 600;
          border: none;
          padding: 0;
        }
        .ai-insights-markdown h1 {
          font-size: 1.1em;
        }
        .ai-insights-markdown ul,
        .ai-insights-markdown ol {
          margin: 8px 0;
          padding-left: 20px;
        }
        .ai-insights-markdown li {
          margin: 2px 0;
        }
        .ai-insights-markdown code {
          background: rgba(0, 0, 0, 0.06);
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.85em;
        }
        .ai-insights-markdown pre {
          background: rgba(0, 0, 0, 0.04);
          padding: 8px 12px;
          border-radius: 6px;
          margin: 8px 0;
        }
        .ai-insights-markdown pre code {
          background: none;
          padding: 0;
        }
        .ai-insights-markdown table {
          margin: 8px 0;
          font-size: 0.9em;
        }
        .ai-insights-markdown th,
        .ai-insights-markdown td {
          padding: 4px 8px;
        }
        .ai-insights-markdown blockquote {
          margin: 8px 0;
          padding-left: 12px;
          border-left-width: 3px;
        }
      `}</style>
    </div>
  );
}
