'use client';

import { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { MARKETPLACE_ITEMS, TYPE_LABELS } from '@/lib/marketplace-data';
import type { PluginType } from '@/lib/marketplace-data';
import s from './page.module.css';

const TYPE_OPTIONS: (PluginType | 'all')[] = ['all', 'plugin', 'adapter', 'widget', 'hook'];

function TypeIcon({ type, size = 20 }: { type: PluginType; size?: number }) {
  if (type === 'plugin') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="8" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="1" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M10.5 8v5M8 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (type === 'adapter') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="3" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 7h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  if (type === 'widget') return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="1" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M4 13h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M7 10v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M7 1v3M7 10v3M1 7h3M10 7h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function NavIcon({ type }: { type: PluginType | 'all' }) {
  if (type === 'all') return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1" y="1" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="1" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="1" y="8" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="8" y="8" width="5" height="5" rx="1.3" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
  return <TypeIcon type={type as PluginType} size={15} />;
}

export function MarketplaceCatalog() {
  const locale = useLocale();
  const [activeType, setActiveType] = useState<PluginType | 'all'>('all');
  const [activeAuthor, setActiveAuthor] = useState<'all' | 'official' | 'community'>('all');
  const [query, setQuery] = useState('');

  const typeCounts = useMemo(() =>
    Object.fromEntries(
      TYPE_OPTIONS.map((t) => [
        t,
        t === 'all'
          ? MARKETPLACE_ITEMS.length
          : MARKETPLACE_ITEMS.filter((i) => i.type === t).length,
      ]),
    )
  , []);

  const filtered = useMemo(() => {
    let items = MARKETPLACE_ITEMS;
    if (activeType !== 'all') items = items.filter((i) => i.type === activeType);
    if (activeAuthor !== 'all') items = items.filter((i) => i.authorType === activeAuthor);
    if (query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      );
    }
    return items;
  }, [activeType, activeAuthor, query]);

  return (
    <div className={s.root}>
      {/* ── Sidebar ── */}
      <nav className={s.sidebar}>
        <div className={s.sidebarSection}>
          <p className={s.sidebarLabel}>Browse</p>
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              className={`${s.sidebarItem}${activeType === t && activeAuthor === 'all' ? ` ${s.sidebarItemActive}` : ''}`}
              onClick={() => { setActiveType(t); setActiveAuthor('all'); }}
            >
              <span className={s.sidebarItemIcon}><NavIcon type={t} /></span>
              <span>{TYPE_LABELS[t]}</span>
              <span className={s.sidebarCount}>{typeCounts[t]}</span>
            </button>
          ))}
        </div>

        <div className={s.sidebarSection}>
          <p className={s.sidebarLabel}>Author</p>
          {(['official', 'community'] as const).map((a) => (
            <button
              key={a}
              className={`${s.sidebarItem}${activeAuthor === a ? ` ${s.sidebarItemActive}` : ''}`}
              onClick={() => { setActiveAuthor(activeAuthor === a ? 'all' : a); }}
            >
              <span className={s.sidebarItemIcon}>
                {a === 'official' ? (
                  <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <path d="M7 1.5L2 3.5V7c0 2.8 2 4.8 5 5.5 3-.7 5-2.7 5-5.5V3.5L7 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                    <path d="M5 7l1.5 1.5L9 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                )}
              </span>
              <span style={{ textTransform: 'capitalize' }}>{a}</span>
              <span className={s.sidebarCount}>
                {MARKETPLACE_ITEMS.filter((i) => i.authorType === a).length}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content ── */}
      <div className={s.content}>
        <div className={s.topbar}>
          <div className={s.searchWrap}>
            <svg className={s.searchIcon} width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              className={s.searchInput}
              type="search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search marketplace"
            />
          </div>
          <p className={s.resultCount}>{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</p>
        </div>

        {filtered.length === 0 ? (
          <div className={s.empty}>
            <p>No results{query ? <> for <strong>&ldquo;{query}&rdquo;</strong></> : null}</p>
            <button
              className={s.emptyReset}
              onClick={() => { setQuery(''); setActiveType('all'); setActiveAuthor('all'); }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className={s.grid}>
            {filtered.map((item) => (
              <a key={item.slug} className={s.card} href={`/${locale}/marketplace/${item.slug}`}>
                <div className={s.cardHead}>
                  <div className={`${s.cardIcon} ${s[`icon-${item.type}`]}`}>
                    <TypeIcon type={item.type} size={22} />
                  </div>
                  {item.authorType === 'official' && (
                    <span className={s.officialBadge}>Official</span>
                  )}
                </div>
                <h3 className={s.cardName}>{item.name}</h3>
                <p className={s.cardDesc}>{item.description}</p>
                <p className={s.cardAuthor}>by {item.author}</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
