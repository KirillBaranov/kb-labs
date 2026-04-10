/**
 * AI Assistant Modal for Plugin Inspector
 *
 * Allows users to ask questions about a plugin and get AI-generated answers
 * based on the plugin's manifest.
 */

import React, { useState } from 'react';
import {
  UIModal,
  UIInputTextArea,
  UIButton,
  UISpace,
  UITypographyText,
  UICard,
  UISpin,
  UIAlert,
  UITag,
  UIDivider,
  UIRow,
  UICol,
  UIIcon,
} from '@kb-labs/studio-ui-kit';
import type { PluginAskResponse } from '@kb-labs/studio-data-client';
import { UIMarkdownViewer } from '@kb-labs/studio-ui-kit';

interface PluginAIAssistantModalProps {
  open: boolean;
  onClose: () => void;
  pluginId: string;
  pluginName: string;
  onAsk: (question: string) => Promise<PluginAskResponse>;
}

interface QAItem {
  question: string;
  answer: string;
  timestamp: Date;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

const QUESTION_TEMPLATES = [
  { label: 'What permissions?', value: 'What permissions does this plugin need and why?' },
  { label: 'Show CLI commands', value: 'What CLI commands does this plugin provide? List them with their flags and usage.' },
  { label: 'Show REST APIs', value: 'What REST API endpoints does this plugin expose? Describe their paths, methods, and purpose.' },
  { label: 'What does it do?', value: 'What does this plugin do? Explain its main features and use cases.' },
  { label: 'How to configure?', value: 'How do I configure this plugin? What options are available?' },
  { label: 'What files created?', value: 'What files or directories does this plugin create or modify?' },
];

export function PluginAIAssistantModal({
  open,
  onClose,
  pluginId,
  pluginName,
  onAsk,
}: PluginAIAssistantModalProps) {
  const [customQuestion, setCustomQuestion] = useState('');
  const [history, setHistory] = useState<QAItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async (question: string) => {
    if (!question.trim()) {return;}

    setLoading(true);
    setError(null);

    try {
      const response = await onAsk(question);

      setHistory((prev) => [
        {
          question,
          answer: response.answer,
          timestamp: new Date(),
          usage: response.usage,
        },
        ...prev,
      ]);
      setCustomQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get AI response');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateClick = (question: string) => {
    setCustomQuestion(question);
  };

  const handleSubmit = () => {
    handleAsk(customQuestion);
  };

  return (
    <UIModal
      title={
        <UISpace>
          <UIIcon name="RobotOutlined" />
          <span>AI Assistant</span>
        </UISpace>
      }
      open={open}
      onCancel={onClose}
      width={800}
      footer={[
        <UIButton key="cancel" onClick={onClose}>
          Close
        </UIButton>,
        <UIButton
          key="ask"
          variant="primary"
          icon={<UIIcon name="ThunderboltOutlined" />}
          loading={loading}
          onClick={handleSubmit}
          disabled={!customQuestion.trim()}
        >
          Ask Question
        </UIButton>,
      ]}
    >
      <UISpace direction="vertical" style={{ width: '100%' }} size="large">
        {/* Plugin Preview */}
        <UICard size="small" style={{ backgroundColor: '#fafafa' }}>
          <UIRow gutter={16}>
            <UICol span={12}>
              <UITypographyText type="secondary">Plugin:</UITypographyText>
              <div>
                <UITypographyText strong>{pluginName}</UITypographyText>
              </div>
            </UICol>
            <UICol span={12}>
              <UITypographyText type="secondary">Plugin ID:</UITypographyText>
              <div>
                <UITypographyText code style={{ fontSize: 12 }}>{pluginId}</UITypographyText>
              </div>
            </UICol>
          </UIRow>
        </UICard>

        {/* Quick Templates */}
        <div>
          <UITypographyText strong>Quick Questions:</UITypographyText>
          <div style={{ marginTop: 8 }}>
            <UISpace wrap>
              {QUESTION_TEMPLATES.map((template) => (
                <UIButton
                  key={template.label}
                  size="small"
                  onClick={() => handleTemplateClick(template.value)}
                >
                  {template.label}
                </UIButton>
              ))}
            </UISpace>
          </div>
        </div>

        <UIDivider style={{ margin: '8px 0' }} />

        {/* Custom Question */}
        <div>
          <UITypographyText strong>Your Question:</UITypographyText>
          <UIInputTextArea
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Ask anything about this plugin... (e.g., 'How do I use this plugin?')"
            rows={3}
            style={{ marginTop: 8 }}
            onPressEnter={(e) => {
              if (e.ctrlKey || e.metaKey) {
                handleSubmit();
              }
            }}
          />
          <UITypographyText type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
            Press Ctrl/Cmd + Enter to ask
          </UITypographyText>
        </div>

        {/* Error Display */}
        {error && (
          <UIAlert
            message="Error"
            description={error}
            variant="error"
            closable
            onClose={() => setError(null)}
            showIcon
          />
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <UISpin tip="AI is thinking..." size="large" />
          </div>
        )}

        {/* Q&A History */}
        {history.length > 0 && !loading && (
          <div>
            <UIDivider orientation="left" style={{ margin: '16px 0 8px 0' }}>
              <UITypographyText strong>Conversation History</UITypographyText>
            </UIDivider>
            <UISpace direction="vertical" style={{ width: '100%' }} size="middle">
              {history.map((item, index) => (
                <UICard
                  key={index}
                  size="small"
                  style={{
                    backgroundColor: '#fafafa',
                  }}
                >
                  {/* Question */}
                  <div style={{ marginBottom: 12 }}>
                    <UISpace style={{ marginBottom: 4 }}>
                      <UIIcon name="QuestionCircleOutlined" style={{ color: '#1890ff' }} />
                      <UITypographyText strong>{item.question}</UITypographyText>
                    </UISpace>
                  </div>

                  {/* Answer */}
                  <div
                    style={{
                      background: '#fff',
                      padding: 12,
                      borderRadius: 4,
                      border: '1px solid #e8e8e8',
                      marginBottom: 8,
                    }}
                  >
                    <UIMarkdownViewer content={item.answer} className="plugin-assistant-markdown" />
                  </div>

                  {/* Metadata */}
                  <div style={{ textAlign: 'right' }}>
                    <UISpace size="small">
                      <UITag icon={<UIIcon name="ClockCircleOutlined" />} color="blue">
                        {item.timestamp.toLocaleTimeString()}
                      </UITag>
                      <UITag color="green">
                        {item.usage.promptTokens + item.usage.completionTokens} tokens
                      </UITag>
                    </UISpace>
                  </div>
                </UICard>
              ))}
            </UISpace>
          </div>
        )}

        {/* Empty State */}
        {history.length === 0 && !loading && (
          <div
            style={{
              textAlign: 'center',
              padding: 40,
              backgroundColor: '#fafafa',
              borderRadius: 4,
              border: '1px dashed #d9d9d9',
            }}
          >
            <UIIcon name="RobotOutlined" style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
            <div style={{ fontSize: 14, color: '#999' }}>
              Select a quick question or type your own to get started
            </div>
          </div>
        )}
      </UISpace>

      {/* Custom styles for markdown in modal context */}
      <style>{`
        .plugin-assistant-markdown {
          padding: 0;
          background: transparent;
          border-radius: 0;
        }
        .plugin-assistant-markdown p {
          margin: 0 0 8px 0;
        }
        .plugin-assistant-markdown p:last-child {
          margin-bottom: 0;
        }
        .plugin-assistant-markdown h1,
        .plugin-assistant-markdown h2,
        .plugin-assistant-markdown h3,
        .plugin-assistant-markdown h4 {
          margin-top: 12px;
          margin-bottom: 8px;
          font-size: 1em;
          font-weight: 600;
          border: none;
          padding: 0;
        }
        .plugin-assistant-markdown h1 {
          font-size: 1.15em;
        }
        .plugin-assistant-markdown h2 {
          font-size: 1.1em;
        }
        .plugin-assistant-markdown h3 {
          font-size: 1.05em;
        }
        .plugin-assistant-markdown ul,
        .plugin-assistant-markdown ol {
          margin: 8px 0;
          padding-left: 20px;
        }
        .plugin-assistant-markdown li {
          margin: 4px 0;
        }
        .plugin-assistant-markdown code {
          background: rgba(0, 0, 0, 0.06);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.9em;
          font-family: 'SF Mono', Menlo, Monaco, Consolas, monospace;
        }
        .plugin-assistant-markdown pre {
          background: #f5f5f5;
          padding: 12px 16px;
          border-radius: 6px;
          margin: 12px 0;
          overflow-x: auto;
        }
        .plugin-assistant-markdown pre code {
          background: none;
          padding: 0;
          font-size: 0.85em;
        }
        .plugin-assistant-markdown table {
          margin: 12px 0;
          font-size: 0.9em;
          width: 100%;
          border-collapse: collapse;
        }
        .plugin-assistant-markdown th,
        .plugin-assistant-markdown td {
          padding: 8px 12px;
          border: 1px solid #e8e8e8;
          text-align: left;
        }
        .plugin-assistant-markdown th {
          background: #fafafa;
          font-weight: 600;
        }
        .plugin-assistant-markdown blockquote {
          margin: 12px 0;
          padding: 8px 16px;
          border-left: 4px solid #1890ff;
          background: #f6f8fa;
          border-radius: 0 4px 4px 0;
        }
        .plugin-assistant-markdown strong {
          font-weight: 600;
        }
        .plugin-assistant-markdown a {
          color: #1890ff;
        }
        .plugin-assistant-markdown hr {
          margin: 16px 0;
          border: none;
          border-top: 1px solid #e8e8e8;
        }
      `}</style>
    </UIModal>
  );
}
