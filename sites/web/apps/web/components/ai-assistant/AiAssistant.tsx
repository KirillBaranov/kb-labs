'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createWebDataSources, type ChatMessage } from '@kb-labs/web-data-source';
import { useTranslations } from 'next-intl';
import { Sparkles, X, Send, Maximize2, Minimize2 } from 'lucide-react';
import s from './AiAssistant.module.css';

/* ── Component ── */

interface AiAssistantProps {
  open: boolean;
  onClose: () => void;
  locale: string;
}

export function AiAssistant({ open, onClose, locale }: AiAssistantProps) {
  const t = useTranslations('ui');
  const source = useMemo(
    () => createWebDataSources({ mode: 'mock' }).aiAssistant,
    [],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Word-by-word streaming
  const simulateStreaming = useCallback(async (fullText: string): Promise<void> => {
    const words = fullText.split(' ');
    for (let i = 0; i < words.length; i++) {
      await new Promise((r) => setTimeout(r, 25));
      setStreamingText(words.slice(0, i + 1).join(' '));
    }
    setStreamingText('');
  }, []);

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || isLoading) return;

      const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: msg,
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const response = await source.sendMessage(msg, locale, [...messages, userMessage]);
        await simulateStreaming(response.text);
        setMessages((prev) => [...prev, response]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            text: t('aiError'),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, locale, messages, source, simulateStreaming, t],
  );

  const suggestedQuestions = source.getSuggestedQuestions(locale);

  return (
    <>
      {createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`${s.backdrop} ${open ? s.backdropOpen : ''}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={`${s.drawer} ${open ? s.drawerOpen : ''} ${expanded ? s.drawerExpanded : ''}`}
        role="dialog"
        aria-label="Ask AI"
      >
        {/* Header */}
        <div className={s.header}>
          <div className={s.headerTitle}>
            <Sparkles size={15} />
            <span>Ask AI</span>
          </div>
          <div className={s.headerButtons}>
            <button className={s.expandBtn} onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <button className={s.closeBtn} onClick={() => { onClose(); setExpanded(false); }} aria-label="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={s.messages}>
          {messages.length === 0 && !isLoading && (
            <div className={s.starter}>
              <p className={s.starterText}>
                {t('aiStarterText')}
              </p>
              <div className={s.chips}>
                {suggestedQuestions.map((q) => (
                  <button key={q} className={s.chip} onClick={() => handleSend(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`${s.bubble} ${msg.role === 'user' ? s.bubbleUser : s.bubbleAssistant}`}>
              <p>{msg.text}</p>
              {msg.links && msg.links.length > 0 && (
                <div className={s.links}>
                  {msg.links.map((link) => (
                    <a key={link.href} href={link.href} className={s.link}>
                      {link.title} &rarr;
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Streaming / typing */}
          {isLoading && (
            streamingText ? (
              <div className={`${s.bubble} ${s.bubbleAssistant}`}>
                <p>{streamingText}</p>
              </div>
            ) : (
              <div className={s.typing}>
                <span className={s.typingDot} />
                <span className={s.typingDot} />
                <span className={s.typingDot} />
              </div>
            )
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className={s.inputArea}>
          <input
            ref={inputRef}
            className={s.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t('aiPlaceholder')}
            disabled={isLoading}
          />
          <button
            className={s.sendBtn}
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            aria-label="Send"
          >
            <Send size={15} />
          </button>
        </div>
      </aside>
    </>,
    document.body,
  )}
    </>
  );
}
