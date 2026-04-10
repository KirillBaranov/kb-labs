import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { MARKETPLACE_ITEMS, TYPE_LABELS, getItemBySlug } from '@/lib/marketplace-data';
import { buildPageMetadata } from '@/lib/page-metadata';
import s from './page.module.css';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateStaticParams() {
  return MARKETPLACE_ITEMS.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const item = getItemBySlug(slug);
  if (!item) return {};
  return buildPageMetadata({
    locale,
    title: item.name,
    description: item.description,
    path: `/marketplace/${slug}`,
    imageSegment: 'marketplace',
  });
}

export default async function PluginPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const item = getItemBySlug(slug);
  if (!item) notFound();

  const paragraphs = item.longDescription.split('\n\n');

  return (
    <>
      <SiteHeader />
      <main className={s.main}>

        {/* ── Back link ── */}
        <Link href={`/${locale}/marketplace`} className={s.backLink}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Marketplace
        </Link>

        {/* ── Page header ── */}
        <div className={s.pageHeader}>
          <div className={`${s.typeIcon} ${s[`icon-${item.type}`]}`}>
            {item.type === 'plugin' && (
              <svg width="28" height="28" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="8" y="1" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="1" y="8" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M10.5 8v5M8 10.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
            {item.type === 'adapter' && (
              <svg width="28" height="28" viewBox="0 0 14 14" fill="none">
                <circle cx="3" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
                <circle cx="11" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 7h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
            {item.type === 'widget' && (
              <svg width="28" height="28" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M4 13h6M7 10v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
            {item.type === 'hook' && (
              <svg width="28" height="28" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v3M7 10v3M1 7h3M10 7h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            )}
          </div>
          <div className={s.pageHeaderText}>
            <div className={s.pageHeaderMeta}>
              <span className={`${s.typeBadge} ${s[`type-${item.type}`]}`}>
                {TYPE_LABELS[item.type].replace(/s$/, '')}
              </span>
              {item.authorType === 'official' && (
                <span className={s.officialBadge}>Official</span>
              )}
            </div>
            <h1 className={s.name}>{item.name}</h1>
            <p className={s.tagline}>{item.description}</p>
          </div>
        </div>

        <div className={s.layout}>
          {/* ── Main content ── */}
          <div className={s.content}>

            {/* Install block */}
            <div className={s.installBlock}>
              <p className={s.installLabel}>Install</p>
              <div className={s.installCmd}>
                <code>{item.installCmd}</code>
                <button
                  className={s.copyBtn}
                  aria-label="Copy install command"
                  data-copy={item.installCmd}
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M2 10V2.5A.5.5 0 012.5 2H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Copy
                </button>
              </div>
            </div>

            {/* About */}
            <section className={s.section}>
              <h2 className={s.sectionTitle}>About</h2>
              {paragraphs.map((p, i) => (
                <p key={i} className={s.bodyText}>{p}</p>
              ))}
            </section>

            {/* Commands */}
            {item.commands && item.commands.length > 0 && (
              <section className={s.section}>
                <h2 className={s.sectionTitle}>CLI Commands</h2>
                <div className={s.commandList}>
                  {item.commands.map((cmd) => (
                    <div key={cmd} className={s.commandRow}>
                      <code className={s.commandCode}>{cmd}</code>
                      <span className={s.commandHint}>kb {cmd} --help</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Permissions + env vars as simple lists */}
            {((item.permissions && item.permissions.length > 0) ||
              (item.envVars && item.envVars.length > 0) ||
              (item.allowedHosts && item.allowedHosts.length > 0)) && (
              <section className={s.section}>
                <h2 className={s.sectionTitle}>Requirements</h2>
                <div className={s.reqGrid}>
                  {item.permissions && item.permissions.length > 0 && (
                    <div className={s.reqGroup}>
                      <p className={s.reqLabel}>Permissions</p>
                      {item.permissions.map((p) => (
                        <p key={p} className={s.reqItem}><code>{p}</code></p>
                      ))}
                    </div>
                  )}
                  {item.allowedHosts && item.allowedHosts.length > 0 && (
                    <div className={s.reqGroup}>
                      <p className={s.reqLabel}>Network access</p>
                      {item.allowedHosts.map((h) => (
                        <p key={h} className={s.reqItem}><code>{h}</code></p>
                      ))}
                    </div>
                  )}
                  {item.envVars && item.envVars.length > 0 && (
                    <div className={s.reqGroup}>
                      <p className={s.reqLabel}>Environment variables</p>
                      {item.envVars.map((v) => (
                        <p key={v} className={s.reqItem}><code>{v}</code></p>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside className={s.sidebar}>
            <dl className={s.metaList}>
              <div className={s.metaRow}>
                <dt>Downloads</dt>
                <dd>{item.weeklyDownloads.toLocaleString()}<span>/wk</span></dd>
              </div>
              <div className={s.metaRow}>
                <dt>Stars</dt>
                <dd>{item.stars}</dd>
              </div>
              <div className={s.metaRow}>
                <dt>Version</dt>
                <dd>v{item.version}</dd>
              </div>
              <div className={s.metaRow}>
                <dt>Author</dt>
                <dd>{item.author}</dd>
              </div>
              <div className={s.metaRow}>
                <dt>Updated</dt>
                <dd>{item.updatedAt}</dd>
              </div>
              <div className={s.metaRow}>
                <dt>Type</dt>
                <dd>{TYPE_LABELS[item.type].replace(/s$/, '')}</dd>
              </div>
            </dl>

            {item.tags.length > 0 && (
              <div className={s.sideTagsWrap}>
                <p className={s.sideTagsLabel}>Tags</p>
                <div className={s.sideTags}>
                  {item.tags.map((t) => (
                    <span key={t} className={s.sideTag}>{t}</span>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter />

      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelectorAll('[data-copy]').forEach(btn => {
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
              const orig = btn.innerHTML;
              btn.textContent = 'Copied!';
              setTimeout(() => { btn.innerHTML = orig; }, 1800);
            });
          });
        });
      `}} />
    </>
  );
}
