import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Badge, Button, Container, GlowCard, Section, TerminalBlock } from '@kb-labs/web-site-ui';
import { fetchRegistryItems, fetchRegistryItem } from '@/lib/marketplace-data';
import { buildPageMetadata } from '@/lib/page-metadata';

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
          <Link href={`/${locale}/product/marketplace`} className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted/60 hover:text-kb-text transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('marketplace.detail.backLink')}
          </Link>

          {/* ── Page header ── */}
          <div className="mb-10 flex items-start gap-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-line bg-surface/60 text-muted/70">
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
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-muted/70">
                  {t(`marketplace.detail.type${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}` as never)}
                </span>
                {item.authorType === 'official' && (
                  <span className="rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider bg-accent text-white">Official</span>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-kb-text">{item.name}</h1>
              <p className="text-base text-muted/70">{item.description}</p>
            </div>
          </div>

          <div className="flex gap-10 items-start lg:flex-row flex-col">
            {/* ── Main content ── */}
            <div className="min-w-0 flex-1 flex flex-col gap-8">

              {/* Install block */}
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-muted/50">{t('marketplace.detail.installLabel')}</p>
                <TerminalBlock commands={[item.installCmd]} bare />
              </div>

              {/* README or About */}
              {readmeContent ? (
                <section className="prose prose-invert max-w-none">{readmeContent}</section>
              ) : (
                <section className="flex flex-col gap-4">
                  <h2 className="text-lg font-semibold text-kb-text">{t('marketplace.detail.aboutTitle')}</h2>
                  {paragraphs.map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-muted/70">{p}</p>
                  ))}
                </section>
              )}

              {/* Commands */}
              {item.commands && item.commands.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-lg font-semibold text-kb-text">{t('marketplace.detail.commandsTitle')}</h2>
                  <div className="flex flex-col gap-2">
                    {item.commands.map((cmd) => (
                      <div key={cmd} className="flex items-center gap-4 rounded-lg border border-line bg-surface/30 px-4 py-2.5">
                        <code className="font-mono text-sm text-kb-text">{cmd}</code>
                        <span className="ml-auto text-xs text-muted/40">kb {cmd} --help</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Requirements */}
              {hasRequirements && (
                <section>
                  <details className="rounded-xl border border-line">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-kb-text">{t('marketplace.detail.requirementsTitle')}</summary>
                    <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-3">
                      {item.permissions && item.permissions.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50">{t('marketplace.detail.permissionsLabel')}</p>
                          {item.permissions.map((p) => <p key={p} className="text-xs text-muted/70"><code>{p}</code></p>)}
                        </div>
                      )}
                      {item.allowedHosts && item.allowedHosts.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50">{t('marketplace.detail.networkLabel')}</p>
                          {item.allowedHosts.map((h) => <p key={h} className="text-xs text-muted/70"><code>{h}</code></p>)}
                        </div>
                      )}
                      {item.envVars && item.envVars.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50">{t('marketplace.detail.envLabel')}</p>
                          {item.envVars.map((v) => <p key={v} className="text-xs text-muted/70"><code>{v}</code></p>)}
                        </div>
                      )}
                    </div>
                  </details>
                </section>
              )}
            </div>

            {/* ── Sidebar ── */}
            <aside className="w-full lg:w-56 shrink-0 flex flex-col gap-5">
              <dl className="flex flex-col divide-y divide-line rounded-xl border border-line">
                {[
                  [t('marketplace.detail.downloadsLabel'), item.weeklyDownloads > 0 ? item.weeklyDownloads.toLocaleString(locale) : t('marketplace.detail.comingSoon')],
                  [t('marketplace.detail.versionLabel'), `v${item.version}`],
                  [t('marketplace.detail.authorLabel'), item.author],
                  [t('marketplace.detail.updatedLabel'), item.updatedAt],
                  [t('marketplace.detail.typeLabel'), t(`marketplace.detail.type${item.type.charAt(0).toUpperCase()}${item.type.slice(1)}` as never)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between px-3 py-2.5 text-sm">
                    <dt className="text-muted/50">{label}</dt>
                    <dd className="font-medium text-kb-text">{value}</dd>
                  </div>
                ))}
              </dl>

              {item.tags.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50">{t('marketplace.detail.tagsLabel')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-md border border-line px-2 py-0.5 text-xs text-muted/60">{tag}</span>
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
