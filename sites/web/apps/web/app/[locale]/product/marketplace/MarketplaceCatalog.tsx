'use client';

import { useState, useMemo, type ElementType, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@kb-labs/web-site-ui';
import { LayoutGrid, Puzzle, Plug, Monitor, ShieldCheck, Users } from 'lucide-react';
import type { MarketplaceItem, PluginType } from '@/lib/marketplace-data';

const TYPE_OPTIONS: (PluginType | 'all')[] = ['all', 'plugin', 'adapter', 'widget', 'hook'];

const TYPE_ICONS: Record<PluginType | 'all', ElementType> = {
  all: LayoutGrid,
  plugin: Puzzle,
  adapter: Plug,
  widget: Monitor,
  hook: LayoutGrid,
};

export function MarketplaceCatalog({ items, locale }: { items: MarketplaceItem[]; locale: string }) {
  const t = useTranslations();
  const [activeType, setActiveType] = useState<PluginType | 'all'>('all');
  const [activeAuthor, setActiveAuthor] = useState<'all' | 'official' | 'community'>('all');
  const [query, setQuery] = useState('');

  const typeCounts = useMemo(() =>
    Object.fromEntries(
      TYPE_OPTIONS.map((type) => [
        type,
        type === 'all' ? items.length : items.filter((i) => i.type === type).length,
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
      <div className="py-32 text-center">
        <p className="mb-2 text-2xl font-bold tracking-tight text-kb-text">{t('marketplace.catalog.comingSoon')}</p>
        <p className="text-base text-muted/60">{t('marketplace.catalog.comingSoonDesc')}</p>
      </div>
    );
  }

  const filterBtnCls = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[0.82rem] transition-all ${
      active
        ? 'bg-accent/10 text-accent font-medium ring-1 ring-inset ring-accent/20'
        : 'text-muted hover:bg-surface hover:text-kb-text'
    }`;

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-10 sm:items-start">

      {/* ── Sidebar ── */}
      <nav className="flex flex-row flex-wrap gap-x-4 gap-y-4 sm:w-40 sm:shrink-0 sm:flex-col sm:gap-6">
        <div className="flex flex-col gap-0.5">
          <p className="mb-2 px-3 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted/55 dark:text-muted/40">
            {t('marketplace.catalog.categoriesLabel')}
          </p>
          {TYPE_OPTIONS.map((type) => {
            const typeKey = type === 'all' ? 'typeAll' : type === 'plugin' ? 'typePlugin' : type === 'adapter' ? 'typeAdapter' : 'typeWidget';
            const isActive = activeType === type && activeAuthor === 'all';
            const Icon = TYPE_ICONS[type];
            return (
              <button
                key={type}
                className={filterBtnCls(isActive)}
                onClick={() => { setActiveType(type); setActiveAuthor('all'); }}
              >
                <Icon size={14} className="shrink-0 opacity-70" />
                <span className="flex-1 text-left">{t(`marketplace.catalog.${typeKey}`)}</span>
                <span className={`text-xs tabular-nums ${isActive ? 'text-accent/60' : 'text-muted/45 dark:text-muted/30'}`}>
                  {typeCounts[type]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-0.5">
          <p className="mb-2 px-3 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted/55 dark:text-muted/40">
            {t('marketplace.catalog.authorLabel')}
          </p>
          {(['official', 'community'] as const).map((a) => {
            const isActive = activeAuthor === a;
            const Icon = a === 'official' ? ShieldCheck : Users;
            return (
              <button
                key={a}
                className={filterBtnCls(isActive)}
                onClick={() => { setActiveAuthor(activeAuthor === a ? 'all' : a); }}
              >
                <Icon size={14} className="shrink-0 opacity-70" />
                <span className="flex-1 text-left">{t(`marketplace.catalog.${a}`)}</span>
                <span className={`text-xs tabular-nums ${isActive ? 'text-accent/60' : 'text-muted/45 dark:text-muted/30'}`}>
                  {items.filter((i) => i.authorType === a).length}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="min-w-0 flex-1">
        {/* Search bar */}
        <div className="mb-6 flex items-center gap-3">
          <Input
            type="search"
            placeholder={t('marketplace.catalog.searchPlaceholder')}
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            aria-label={t('marketplace.catalog.searchAriaLabel')}
            className="flex-1"
          />
          <p className="shrink-0 font-mono text-[0.75rem] text-muted/55 dark:text-muted/40">
            {t('marketplace.catalog.resultCount', { count: filtered.length })}
          </p>
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="mb-1 text-muted/60">
              {query ? t('marketplace.catalog.noResultsQuery', { query }) : t('marketplace.catalog.noResults')}
            </p>
            <button
              className="mt-3 text-sm text-accent underline underline-offset-2"
              onClick={() => { setQuery(''); setActiveType('all'); setActiveAuthor('all'); }}
            >
              {t('marketplace.catalog.resetFilters')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
            {filtered.map((item) => (
              <a
                key={item.slug}
                href={`/${locale}/product/marketplace/${item.slug}`}
                className="group no-underline"
              >
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-5 transition-all duration-200 group-hover:border-accent/30 group-hover:bg-surface/80">
                  {/* Icon row */}
                  <div className="flex items-center justify-between">
                    <div className="flex size-9 items-center justify-center rounded-xl border border-line bg-bg text-muted/70 transition-colors group-hover:border-accent/20 group-hover:text-accent/70">
                      {(() => { const Icon = TYPE_ICONS[item.type]; return <Icon size={17} />; })()}
                    </div>
                    {item.authorType === 'official' && (
                      <span className="rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/20">
                        Official
                      </span>
                    )}
                  </div>

                  {/* Name */}
                  <div>
                    <h3 className="text-[0.9rem] font-semibold text-kb-text">{item.name}</h3>
                    <p className="mt-1 text-[0.8rem] leading-relaxed text-muted/60 line-clamp-2">{item.description}</p>
                  </div>

                  {/* Footer */}
                  <p className="mt-auto font-mono text-[0.7rem] text-muted/50 dark:text-muted/35">by {item.author}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
