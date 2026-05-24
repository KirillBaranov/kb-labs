import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Container } from '@kb-labs/web-site-ui';
import { fetchRegistryItems, fetchRegistryItem } from '@/lib/marketplace-data';
import { buildPageMetadata } from '@/lib/page-metadata';
import s from './page.module.css';

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = true;

export async function generateStaticParams() {
  const items = await fetchRegistryItems();
  return items.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const item = await fetchRegistryItem(slug);
  if (!item) return {};
  return buildPageMetadata({
    locale,
    title: item.name,
    description: item.description,
    path: `/product/marketplace/${slug}`,
    imageSegment: 'marketplace',
  });
}

export default async function PluginPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const item = await fetchRegistryItem(slug);
  if (!item) notFound();

  let readmeContent: React.ReactNode | null = null;
  if (item.readme) {
    try {
      const { content } = await compileMDX({
        source: item.readme,
        options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
      });
      readmeContent = content;
    } catch {
      // fall back to About section
    }
  }

  const paragraphs = item.longDescription.split('\n\n');
  const hasRequirements =
    (item.permissions && item.permissions.length > 0) ||
    (item.envVars && item.envVars.length > 0) ||
    (item.allowedHosts && item.allowedHosts.length > 0);

  return (
    <>
      <SiteHeader />
      <main>
        <Container className="py-8 pb-20">

          {/* ── Back link ── */}
          <Link href={`/${locale}/product/marketplace`} className={s.backLink}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('marketplace.detail.backLink')}
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
                  {t(`marketplace.detail.type${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}` as never)}
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
                <p className={s.installLabel}>{t('marketplace.detail.installLabel')}</p>
                <div className={s.installCmd}>
                  <code>{item.installCmd}</code>
                  <button
                    className={s.copyBtn}
                    aria-label={t('marketplace.detail.copyAriaLabel')}
                    data-copy={item.installCmd}
                    data-copy-text={t('marketplace.detail.copyBtn')}
                    data-copied-text={t('marketplace.detail.copiedBtn')}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                      <path d="M2 10V2.5A.5.5 0 012.5 2H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    </svg>
                    {t('marketplace.detail.copyBtn')}
                  </button>
                </div>
              </div>

              {/* README or About */}
              {readmeContent ? (
                <section className={s.section}>
                  <div className={s.readme}>{readmeContent}</div>
                </section>
              ) : (
                <section className={s.section}>
                  <h2 className={s.sectionTitle}>{t('marketplace.detail.aboutTitle')}</h2>
                  {paragraphs.map((p, i) => (
                    <p key={i} className={s.bodyText}>{p}</p>
                  ))}
                </section>
              )}

              {/* Commands */}
              {item.commands && item.commands.length > 0 && (
                <section className={s.section}>
                  <h2 className={s.sectionTitle}>{t('marketplace.detail.commandsTitle')}</h2>
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

              {/* Requirements */}
              {hasRequirements && (
                <section className={s.section}>
                  <details className={s.reqDetails}>
                    <summary className={s.reqSummary}>{t('marketplace.detail.requirementsTitle')}</summary>
                    <div className={s.reqGrid}>
                      {item.permissions && item.permissions.length > 0 && (
                        <div className={s.reqGroup}>
                          <p className={s.reqLabel}>{t('marketplace.detail.permissionsLabel')}</p>
                          {item.permissions.map((p) => (
                            <p key={p} className={s.reqItem}><code>{p}</code></p>
                          ))}
                        </div>
                      )}
                      {item.allowedHosts && item.allowedHosts.length > 0 && (
                        <div className={s.reqGroup}>
                          <p className={s.reqLabel}>{t('marketplace.detail.networkLabel')}</p>
                          {item.allowedHosts.map((h) => (
                            <p key={h} className={s.reqItem}><code>{h}</code></p>
                          ))}
                        </div>
                      )}
                      {item.envVars && item.envVars.length > 0 && (
                        <div className={s.reqGroup}>
                          <p className={s.reqLabel}>{t('marketplace.detail.envLabel')}</p>
                          {item.envVars.map((v) => (
                            <p key={v} className={s.reqItem}><code>{v}</code></p>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </section>
              )}
            </div>

            {/* ── Sidebar ── */}
            <aside className={s.sidebar}>
              <dl className={s.metaList}>
                <div className={s.metaRow}>
                  <dt>{t('marketplace.detail.downloadsLabel')}</dt>
                  <dd>
                    {item.weeklyDownloads > 0
                      ? item.weeklyDownloads.toLocaleString(locale)
                      : <span className={s.comingSoon}>{t('marketplace.detail.comingSoon')}</span>}
                  </dd>
                </div>
                <div className={s.metaRow}>
                  <dt>{t('marketplace.detail.versionLabel')}</dt>
                  <dd>v{item.version}</dd>
                </div>
                <div className={s.metaRow}>
                  <dt>{t('marketplace.detail.authorLabel')}</dt>
                  <dd>{item.author}</dd>
                </div>
                <div className={s.metaRow}>
                  <dt>{t('marketplace.detail.updatedLabel')}</dt>
                  <dd>{item.updatedAt}</dd>
                </div>
                <div className={s.metaRow}>
                  <dt>{t('marketplace.detail.typeLabel')}</dt>
                  <dd>{t(`marketplace.detail.type${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}` as never)}</dd>
                </div>
              </dl>

              {item.tags.length > 0 && (
                <div className={s.sideTagsWrap}>
                  <p className={s.sideTagsLabel}>{t('marketplace.detail.tagsLabel')}</p>
                  <div className={s.sideTags}>
                    {item.tags.map((t) => (
                      <span key={t} className={s.sideTag}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          </div>

        </Container>
      </main>
      <SiteFooter />

      <script dangerouslySetInnerHTML={{ __html: `
        document.querySelectorAll('[data-copy]').forEach(btn => {
          btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
              const orig = btn.innerHTML;
              btn.textContent = btn.dataset.copiedText || 'Copied!';
              setTimeout(() => { btn.innerHTML = orig; }, 1800);
            });
          });
        });
      `}} />
    </>
  );
}
