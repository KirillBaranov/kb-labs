'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, GlowCard, Input } from '@kb-labs/web-site-ui';
import type { MarketplaceItem, PluginType } from '@/lib/marketplace-data';

const TYPE_OPTIONS: (PluginType | 'all')[] = ['all', 'plugin', 'adapter', 'widget'];

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

export function MarketplaceCatalog({ items, locale }: { items: MarketplaceItem[]; locale: string }) {
  const t = useTranslations();
  const [activeType, setActiveType] = useState<PluginType | 'all'>('all');
  const [activeAuthor, setActiveAuthor] = useState<'all' | 'official' | 'community'>('all');
  const [query, setQuery] = useState('');

  const typeCounts = useMemo(() =>
    Object.fromEntries(
      TYPE_OPTIONS.map((t) => [
        t,
        t === 'all' ? items.length : items.filter((i) => i.type === t).length,
      ]),
    )
  , [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (activeType !== 'all') result = result.filter((i) => i.type === activeType);
    if (activeAuthor !== 'all') result = result.filter((i) => i.authorType === activeAuthor);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [items, activeType, activeAuthor, query]);

  if (items.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="mb-2 text-2xl font-bold tracking-tight text-kb-text">{t('marketplace.catalog.comingSoon')}</p>
        <p className="text-base text-muted/60">
          {t('marketplace.catalog.comingSoonDesc')}
        </p>
      </div>
    );
  }

  const sidebarItemCls = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
      active ? 'bg-surface text-kb-text font-medium' : 'text-muted hover:bg-surface/60 hover:text-kb-text'
    }`;

  return (
    <div className="flex gap-8 items-start">
      {/* ── Sidebar ── */}
      <nav className="w-44 shrink-0 flex flex-col gap-5">
        <div className="flex flex-col gap-0.5">
          <p className="mb-1 px-2 text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50">
            {t('marketplace.catalog.categoriesLabel')}
          </p>
          {TYPE_OPTIONS.map((type) => {
            const typeKey = type === 'all' ? 'typeAll' : type === 'plugin' ? 'typePlugin' : type === 'adapter' ? 'typeAdapter' : 'typeWidget';
            return (
              <button
                key={type}
                className={sidebarItemCls(activeType === type && activeAuthor === 'all')}
                onClick={() => { setActiveType(type); setActiveAuthor('all'); }}
              >
                <span className="flex size-4 shrink-0 items-center justify-center text-muted/60"><NavIcon type={type} /></span>
                <span>{t(`marketplace.catalog.${typeKey}`)}</span>
                <span className="ml-auto text-xs text-muted/40">{typeCounts[type]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-0.5">
          <p className="mb-1 px-2 text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50">
            {t('marketplace.catalog.authorLabel')}
          </p>
          {(['official', 'community'] as const).map((a) => (
            <button
              key={a}
              className={sidebarItemCls(activeAuthor === a)}
              onClick={() => { setActiveAuthor(activeAuthor === a ? 'all' : a); }}
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-muted/60">
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
              <span>{t(`marketplace.catalog.${a}`)}</span>
              <span className="ml-auto text-xs text-muted/40">{items.filter((i) => i.authorType === a).length}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="min-w-0 flex-1">
        <div className="mb-5 flex items-center gap-3">
          <Input
            type="search"
            placeholder={t('marketplace.catalog.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('marketplace.catalog.searchAriaLabel')}
            className="flex-1"
          />
          <p className="shrink-0 text-sm text-muted/50">{t('marketplace.catalog.resultCount', { count: filtered.length })}</p>
        </div>

        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted/60">{query ? t('marketplace.catalog.noResultsQuery', { query }) : t('marketplace.catalog.noResults')}</p>
            <button
              className="mt-3 text-sm text-accent underline"
              onClick={() => { setQuery(''); setActiveType('all'); setActiveAuthor('all'); }}
            >
              {t('marketplace.catalog.resetFilters')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {filtered.map((item) => (
              <a key={item.slug} href={`/${locale}/product/marketplace/${item.slug}`} className="no-underline">
                <GlowCard className="flex h-full flex-col gap-2.5 p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface/60 text-muted">
                      <TypeIcon type={item.type} size={18} />
                    </div>
                    {item.authorType === 'official' && (
                      <Badge variant="accent" className="ml-auto text-[0.6rem]">Official</Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-kb-text">{item.name}</h3>
                  <p className="flex-1 text-xs leading-relaxed text-muted/70">{item.description}</p>
                  <p className="text-xs text-muted/40">by {item.author}</p>
                </GlowCard>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
