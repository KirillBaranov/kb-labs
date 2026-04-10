'use client';

import React, { useRef, useState, type ComponentPropsWithoutRef } from 'react';
import s from './CodeBlock.module.css';

type PreProps = ComponentPropsWithoutRef<'pre'> & {
  'data-language'?: string;
  'data-theme'?: string;
};

const LANGUAGE_LABELS: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JSX',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Zsh',
  md: 'Markdown',
  mdx: 'MDX',
  css: 'CSS',
  html: 'HTML',
  go: 'Go',
  rust: 'Rust',
  py: 'Python',
  python: 'Python',
  sql: 'SQL',
  toml: 'TOML',
  dockerfile: 'Dockerfile',
  plaintext: '',
  text: '',
};

export function CodeBlock(props: PreProps) {
  const { children, className, ...rest } = props;
  const lang = props['data-language'];
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  // Inline code (single backticks) is wrapped in <code> directly, not <pre>.
  // Only style/extend block-level <pre>.
  const onCopy = async () => {
    const text = ref.current?.innerText ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const label = lang ? LANGUAGE_LABELS[lang] ?? lang.toUpperCase() : '';

  return (
    <div className={s.wrapper}>
      <div className={s.toolbar}>
        {label && <span className={s.lang}>{label}</span>}
        <button
          type="button"
          className={s.copyBtn}
          onClick={onCopy}
          aria-label="Copy code"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre ref={ref} className={`${s.pre} ${className ?? ''}`} {...rest}>
        {children as React.ReactNode}
      </pre>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}
