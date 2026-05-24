'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { MarketplaceItem, PluginType } from '@/lib/marketplace-data';
import s from './page.module.css';

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

  return (
    <div className={s.root}>
      {/* ── Sidebar ── */}
      <nav className={s.sidebar}>
        <div className={s.sidebarSection}>
          <p className={s.sidebarLabel}>{t('marketplace.catalog.categoriesLabel')}</p>
          {TYPE_OPTIONS.map((type) => {
            const typeKey = type === 'all' ? 'typeAll' : type === 'plugin' ? 'typePlugin' : type === 'adapter' ? 'typeAdapter' : type === 'widget' ? 'typeWidget' : 'typeHook';
            return (
              <button
                key={type}
                className={`${s.sidebarItem}${activeType === type && activeAuthor === 'all' ? ` ${s.sidebarItemActive}` : ''}`}
                onClick={() => { setActiveType(type); setActiveAuthor('all'); }}
              >
                <span className={s.sidebarItemIcon}><NavIcon type={type} /></span>
                <span>{t(`marketplace.catalog.${typeKey}`)}</span>
                <span className={s.sidebarCount}>{typeCounts[type]}</span>
              </button>
            );
          })}
        </div>

        <div className={s.sidebarSection}>
          <p className={s.sidebarLabel}>{t('marketplace.catalog.authorLabel')}</p>
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
              <span>{t(`marketplace.catalog.${a}`)}</span>
              <span className={s.sidebarCount}>{items.filter((i) => i.authorType === a).length}</span>
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
              placeholder={t('marketplace.catalog.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('marketplace.catalog.searchAriaLabel')}
            />
          </div>
          <p className={s.resultCount}>{t('marketplace.catalog.resultCount', { count: filtered.length })}</p>
        </div>

        {filtered.length === 0 ? (
          <div className={s.empty}>
            <p>{query ? t('marketplace.catalog.noResultsQuery', { query }) : t('marketplace.catalog.noResults')}</p>
            <button
              className={s.emptyReset}
              onClick={() => { setQuery(''); setActiveType('all'); setActiveAuthor('all'); }}
            >
              {t('marketplace.catalog.resetFilters')}
            </button>
          </div>
        ) : (
          <div className={s.grid}>
            {filtered.map((item) => (
              <a key={item.slug} className={s.card} href={`/${locale}/product/marketplace/${item.slug}`}>
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
