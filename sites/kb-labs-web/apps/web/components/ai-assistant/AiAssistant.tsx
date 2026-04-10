'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { createWebDataSources, type ChatMessage } from '@kb-labs/web-data-source';
import s from './AiAssistant.module.css';

/* ── Icons ── */

function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1l1.8 4.2L14 7l-4.2 1.8L8 13l-1.8-4.2L2 7l4.2-1.8z" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 2l10 10M12 2L2 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2L7 9" />
      <path d="M14 2l-5 12-2-5-5-2z" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 1.5H12.5V5.5" />
      <path d="M5.5 12.5H1.5V8.5" />
      <path d="M12.5 1.5L8 6" />
      <path d="M1.5 12.5L6 8" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {/* Top-right corner piece at center, arrow pointing to top-right */}
      <path d="M6 1.5V5.5H2" />
      <path d="M8 12.5V8.5H12" />
      <path d="M6 5.5L1 1" />
      <path d="M8 8.5L13 13" />
    </svg>
  );
}

/* ── Component ── */

interface AiAssistantProps {
  open: boolean;
  onClose: () => void;
  locale: string;
}

export function AiAssistant({ open, onClose, locale }: AiAssistantProps) {
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
            text: locale === 'ru' ? 'Произошла ошибка. Попробуйте ещё раз.' : 'Something went wrong. Please try again.',
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [input, isLoading, locale, messages, source, simulateStreaming],
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
            <SparkleIcon />
            <span>Ask AI</span>
          </div>
          <div className={s.headerButtons}>
            <button className={s.expandBtn} onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Collapse' : 'Expand'}>
              {expanded ? <CollapseIcon /> : <ExpandIcon />}
            </button>
            <button className={s.closeBtn} onClick={() => { onClose(); setExpanded(false); }} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className={s.messages}>
          {messages.length === 0 && !isLoading && (
            <div className={s.starter}>
              <p className={s.starterText}>
                {locale === 'ru' ? 'Спросите что-нибудь о KB Labs' : 'Ask anything about KB Labs'}
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
            placeholder={locale === 'ru' ? 'Задайте вопрос...' : 'Ask a question...'}
            disabled={isLoading}
          />
          <button
            className={s.sendBtn}
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            aria-label="Send"
          >
            <SendIcon />
          </button>
        </div>
      </aside>
    </>,
    document.body,
  )}
    </>
  );
}
