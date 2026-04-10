'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import Fuse from 'fuse.js';
import type { SearchRecord } from '@/app/api/search-index/route';
import s from './SearchModal.module.css';

type Props = {
  onClose: () => void;
};

type Result = {
  item: SearchRecord;
  matches?: readonly { key?: string; value?: string; indices: readonly [number, number][] }[];
};

let cachedIndex: SearchRecord[] | null = null;

function highlight(text: string, query: string): string {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

export function SearchModal({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const fuseRef = useRef<Fuse<SearchRecord> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Load index once
  useEffect(() => {
    if (fuseRef.current) return;
    if (cachedIndex) {
      fuseRef.current = buildFuse(cachedIndex);
      return;
    }
    setLoading(true);
    fetch('/api/search-index')
      .then((r) => r.json())
      .then((data: SearchRecord[]) => {
        cachedIndex = data;
        fuseRef.current = buildFuse(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const search = useCallback((q: string) => {
    if (!fuseRef.current || !q.trim()) {
      setResults([]);
      setActiveIdx(0);
      return;
    }
    const raw = fuseRef.current.search(q, { limit: 10 });
    setResults(raw as Result[]);
    setActiveIdx(0);
  }, []);

  const onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    search(q);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      onClose();
      window.location.href = results[activeIdx].item.slug;
    }
  };

  const excerpt = (body: string, q: string): string => {
    if (!q.trim()) return body.slice(0, 120);
    const idx = body.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return body.slice(0, 120);
    const start = Math.max(0, idx - 40);
    const end = Math.min(body.length, idx + 100);
    const pre = start > 0 ? '…' : '';
    const post = end < body.length ? '…' : '';
    return pre + body.slice(start, end) + post;
  };

  return (
    <>
      {/* Backdrop */}
      <div className={s.backdrop} onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className={s.modal} role="dialog" aria-modal="true" aria-label="Search documentation">
        <div className={s.inputWrap}>
          <svg className={s.searchIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className={s.input}
            type="search"
            placeholder="Search documentation…"
            value={query}
            onChange={onQueryChange}
            onKeyDown={onKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className={s.escKbd} onClick={onClose}>Esc</kbd>
        </div>

        <div className={s.results}>
          {loading && <p className={s.hint}>Loading index…</p>}

          {!loading && query && results.length === 0 && (
            <p className={s.hint}>No results for <strong>&quot;{query}&quot;</strong></p>
          )}

          {!loading && !query && (
            <p className={s.hint}>Type to search across all documentation pages.</p>
          )}

          {results.map((r, i) => (
            <Link
              key={r.item.slug}
              href={r.item.slug}
              className={`${s.result} ${i === activeIdx ? s.resultActive : ''}`}
              onClick={onClose}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span
                className={s.resultTitle}
                dangerouslySetInnerHTML={{ __html: highlight(r.item.title, query) }}
              />
              {r.item.description && (
                <span
                  className={s.resultDesc}
                  dangerouslySetInnerHTML={{ __html: highlight(r.item.description, query) }}
                />
              )}
              <span
                className={s.resultBody}
                dangerouslySetInnerHTML={{ __html: highlight(excerpt(r.item.body, query), query) }}
              />
              <span className={s.resultSlug}>{r.item.slug}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function buildFuse(data: SearchRecord[]) {
  return new Fuse(data, {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'description', weight: 2 },
      { name: 'body', weight: 1 },
    ],
    threshold: 0.35,
    includeMatches: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}
