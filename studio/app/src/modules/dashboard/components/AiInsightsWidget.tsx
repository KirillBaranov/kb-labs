import React, { useState, useRef, useEffect } from 'react';
import { UIButton, UITypographyText, UITypographyParagraph, UITitle, UIAvatar, UISpin, UITag, UICard, UIInputTextArea } from '@kb-labs/studio-ui-kit';
import {
  RobotOutlined,
  SendOutlined,
  UserOutlined,
  BulbOutlined,
  CopyOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useDataSources } from '../../../providers/data-sources-provider';
import { usePrometheusMetrics, useAdaptersLLMUsage } from '@kb-labs/studio-data-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  context?: string[];
}

interface SuggestedQuestion {
  text: string;
  category: 'cost' | 'performance' | 'health' | 'optimization';
}

const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  { text: 'Why is LLM cost higher than usual?', category: 'cost' },
  { text: "What's causing latency spikes?", category: 'performance' },
  { text: 'Is the system healthy?', category: 'health' },
  { text: 'How can I reduce API costs?', category: 'optimization' },
  { text: 'Which endpoints are slowest?', category: 'performance' },
  { text: 'Are there any anomalies?', category: 'health' },
];

// Mock AI response generator based on context
const generateMockResponse = (question: string, context: {
  totalRequests: number;
  errorRate: number;
  avgLatency: number;
  totalCost: number;
  topModel: string;
}): { content: string; contextUsed: string[] } => {
  const q = question.toLowerCase();
  const contextUsed: string[] = [];

  if (q.includes('cost') || q.includes('expensive') || q.includes('spending')) {
    contextUsed.push('LLM Usage', 'Cost Attribution');
    return {
      content: `Based on your current metrics, total costs are **$${context.totalCost.toFixed(2)}** today.

**Key findings:**
- Your most expensive model is **${context.topModel}** accounting for ~65% of costs
- Cost per 1K requests: $${(context.totalCost / context.totalRequests * 1000).toFixed(4)}

**Recommendations:**
1. Consider using a smaller model for simple queries
2. Implement response caching for repeated questions
3. Batch similar requests to reduce API overhead`,
      contextUsed,
    };
  }

  if (q.includes('latency') || q.includes('slow') || q.includes('performance')) {
    contextUsed.push('Prometheus Metrics', 'Performance Data');
    return {
      content: `Current average latency is **${context.avgLatency.toFixed(0)}ms**.

**Analysis:**
- P95 latency is approximately ${(context.avgLatency * 1.5).toFixed(0)}ms
- ${context.avgLatency > 200 ? '⚠️ Latency is above recommended threshold (200ms)' : '✅ Latency is within acceptable range'}

**Potential causes:**
1. LLM API response times (external dependency)
2. Database query complexity
3. Network latency to vector store

**Suggestions:**
- Enable response streaming for large outputs
- Implement request timeouts at 5s
- Consider caching frequent queries`,
      contextUsed,
    };
  }

  if (q.includes('health') || q.includes('status') || q.includes('ok')) {
    contextUsed.push('System Health', 'Error Rates');
    const healthStatus = context.errorRate < 1 ? 'healthy' : context.errorRate < 5 ? 'degraded' : 'critical';
    return {
      content: `System status: **${healthStatus.toUpperCase()}**

**Current metrics:**
- Error rate: ${context.errorRate.toFixed(2)}% ${context.errorRate < 1 ? '✅' : '⚠️'}
- Total requests: ${context.totalRequests.toLocaleString()}
- Uptime: ${(100 - context.errorRate).toFixed(2)}%

**Health breakdown:**
- API Gateway: ✅ Healthy
- LLM Adapter: ${context.avgLatency < 300 ? '✅ Healthy' : '⚠️ Slow'}
- Cache Layer: ✅ Healthy
- Vector Store: ✅ Healthy`,
      contextUsed,
    };
  }

  if (q.includes('reduce') || q.includes('optimize') || q.includes('improve')) {
    contextUsed.push('Usage Patterns', 'Cost Analysis');
    return {
      content: `Here are optimization recommendations based on your usage:

**Cost Optimization:**
1. Switch to gpt-3.5-turbo for classification tasks (-40% cost)
2. Implement semantic caching for similar queries (-25% requests)
3. Use shorter system prompts (-15% tokens)

**Performance Optimization:**
1. Enable connection pooling for DB queries
2. Implement request batching for embeddings
3. Add Redis caching for hot paths

**Estimated savings:** $${(context.totalCost * 0.3).toFixed(2)}/day with these changes`,
      contextUsed,
    };
  }

  // Default response
  contextUsed.push('General Metrics');
  return {
    content: `Based on your dashboard data:

- **Total Requests:** ${context.totalRequests.toLocaleString()}
- **Error Rate:** ${context.errorRate.toFixed(2)}%
- **Avg Latency:** ${context.avgLatency.toFixed(0)}ms
- **Total Cost:** $${context.totalCost.toFixed(2)}

Is there something specific you'd like me to analyze? Try asking about:
- Cost breakdown and optimization
- Performance and latency issues
- System health status
- Specific endpoint analysis`,
    contextUsed,
  };
};

export function AIInsightsWidget() {
  const sources = useDataSources();
  const metrics = usePrometheusMetrics(sources.observability);
  const llmUsage = useAdaptersLLMUsage(sources.adapters);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build context from real data
  const buildContext = () => ({
    totalRequests: metrics.data?.requests?.total ?? 0,
    errorRate: metrics.data?.requests?.total
      ? ((metrics.data.requests.clientErrors + metrics.data.requests.serverErrors) / metrics.data.requests.total) * 100
      : 0,
    avgLatency: (metrics.data?.perPlugin?.reduce((sum, p) => sum + (p.latency?.average ?? 0), 0) ?? 0) /
      (metrics.data?.perPlugin?.length || 1),
    totalCost: llmUsage.data?.totalCost ?? 0,
    topModel: Object.entries(llmUsage.data?.byModel ?? {})
      .sort(([, a], [, b]) => (b.cost ?? 0) - (a.cost ?? 0))[0]?.[0] ?? 'gpt-4',
  });

  const sendMessage = async (text: string) => {
    if (!text.trim()) {return;}

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI thinking delay
    await new Promise<void>(resolve => { setTimeout(resolve, 1000 + Math.random() * 1000); });

    const context = buildContext();
    const { content, contextUsed } = generateMockResponse(text, context);

    const assistantMessage: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      context: contextUsed,
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsTyping(false);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'cost': return 'gold';
      case 'performance': return 'blue';
      case 'health': return 'green';
      case 'optimization': return 'purple';
      default: return 'default';
    }
  };

  return (
    <UICard
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RobotOutlined />
          <span>AI Insights</span>
          <UITag color="blue" style={{ marginLeft: 8 }}>Beta</UITag>
        </div>
      }
      style={{ height: '100%' }}
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: 450 } }}
    >
      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <BulbOutlined style={{ fontSize: 48, color: 'var(--border-primary)', marginBottom: 16 }} />
            <UITitle level={5}>Ask me anything about your system</UITitle>
            <UITypographyParagraph type="secondary" style={{ fontSize: 13 }}>
              I can analyze costs, performance, health metrics, and suggest optimizations.
            </UITypographyParagraph>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                <UITag
                  key={i}
                  color={getCategoryColor(q.category)}
                  style={{ cursor: 'pointer', padding: '4px 12px' }}
                  onClick={() => sendMessage(q.text)}
                >
                  {q.text}
                </UITag>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 12,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              <UIAvatar
                size={32}
                icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                style={{
                  backgroundColor: msg.role === 'user' ? 'var(--info)' : 'var(--link)',
                  flexShrink: 0,
                }}
              />
              <div style={{
                maxWidth: '80%',
                padding: '10px 14px',
                borderRadius: 12,
                backgroundColor: msg.role === 'user' ? 'var(--info)' : 'var(--bg-tertiary)',
                color: msg.role === 'user' ? 'var(--text-inverse)' : 'var(--text-primary)',
              }}>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>
                  {msg.content.split('**').map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
                </div>
                {msg.context && msg.context.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {msg.context.map((ctx, i) => (
                      <UITag key={i} style={{ fontSize: 10, margin: 0 }}>{ctx}</UITag>
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <UIButton
                    variant="text"
                    size="small"
                    icon={copiedId === msg.id ? <CheckOutlined /> : <CopyOutlined />}
                    style={{ marginTop: 4, padding: '0 4px', height: 20 }}
                    onClick={() => copyToClipboard(msg.content, msg.id)}
                  />
                )}
              </div>
            </div>
          ))
        )}

        {isTyping && (
          <div style={{ display: 'flex', gap: 12 }}>
            <UIAvatar size={32} icon={<RobotOutlined />} style={{ backgroundColor: 'var(--link)' }} />
            <div style={{
              padding: '10px 14px',
              borderRadius: 12,
              backgroundColor: 'var(--bg-tertiary)',
            }}>
              <UISpin size="small" /> <UITypographyText type="secondary" style={{ marginLeft: 8 }}>Analyzing...</UITypographyText>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--border-primary)',
        display: 'flex',
        gap: 8,
      }}>
        <UIInputTextArea
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          placeholder="Ask about costs, performance, health..."
          autoSize={{ minRows: 1, maxRows: 3 }}
          onPressEnter={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (!e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          style={{ flex: 1 }}
        />
        <UIButton
          variant="primary"
          icon={<SendOutlined />}
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isTyping}
        />
      </div>
    </UICard>
  );
}
