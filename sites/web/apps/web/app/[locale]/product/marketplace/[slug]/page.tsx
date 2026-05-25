import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, Puzzle, Plug, Monitor, LayoutGrid, ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Container, CopyButton } from '@kb-labs/web-site-ui';
import { fetchRegistryItems, fetchRegistryItem } from '@/lib/marketplace-data';
import { buildPageMetadata } from '@/lib/page-metadata';
import type { PluginType } from '@/lib/marketplace-data';

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

const TYPE_ICONS: Record<PluginType | string, React.ElementType> = {
  plugin: Puzzle,
  adapter: Plug,
  widget: Monitor,
  hook: LayoutGrid,
};

const TYPE_CATALOG_KEY: Record<string, string> = {
  plugin: 'typePlugin',
  adapter: 'typeAdapter',
  widget: 'typeWidget',
  hook: 'typeAll',
};

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

  const paragraphs = item.longDescription?.split('\n\n') ?? [];
  const hasRequirements =
    (item.permissions && item.permissions.length > 0) ||
    (item.envVars && item.envVars.length > 0) ||
    (item.allowedHosts && item.allowedHosts.length > 0);

  const TypeIcon = TYPE_ICONS[item.type] ?? LayoutGrid;
  const typeLabel = t(`marketplace.catalog.${TYPE_CATALOG_KEY[item.type] ?? 'typeAll'}` as never);

  const statsRows = [
    [t('marketplace.detail.downloadsLabel'), item.weeklyDownloads > 0 ? item.weeklyDownloads.toLocaleString(locale) : t('marketplace.detail.comingSoon')],
    [t('marketplace.detail.versionLabel'), `v${item.version}`],
    [t('marketplace.detail.authorLabel'), item.author],
    [t('marketplace.detail.updatedLabel'), item.updatedAt],
    [t('marketplace.detail.typeLabel'), typeLabel],
  ];

  return (
    <>
      <SiteHeader />
      <main>
        <Container className="py-8 pb-24">

          {/* ── Back link ── */}
          <Link
            href={`/${locale}/product/marketplace`}
            className="mb-8 inline-flex items-center gap-1 text-sm text-muted/60 transition-colors hover:text-kb-text"
          >
            <ChevronLeft size={15} />
            {t('marketplace.detail.backLink')}
          </Link>

          {/* ── Page header ── */}
          <div className="mb-10 flex items-start gap-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-muted/70">
              <TypeIcon size={26} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[0.68rem] text-muted/60">
                  {typeLabel}
                </span>
                {item.authorType === 'official' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-0.5 font-mono text-[0.68rem] font-semibold text-accent ring-1 ring-inset ring-accent/20">
                    {/* i18n-ignore */}
                    <ShieldCheck size={10} /> Official
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-kb-text">{item.name}</h1>
              <p className="text-base text-muted/70">{item.description}</p>
            </div>
          </div>

          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">

            {/* ── Main content ── */}
            <div className="min-w-0 flex-1 flex flex-col gap-8">

              {/* Install command */}
              <div>
                <p className="mb-2 text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted/55 dark:text-muted/40">
                  {t('marketplace.detail.installLabel')}
                </p>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  <code className="font-mono text-[0.85rem] text-kb-text">{item.installCmd}</code>
                  <CopyButton code={item.installCmd} className="shrink-0" />
                </div>
              </div>

              {/* README or About */}
              {readmeContent ? (
                <article className="prose prose-invert max-w-none
                  prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-kb-text
                  prose-p:text-muted/80 prose-p:leading-relaxed
                  prose-a:text-accent prose-a:no-underline hover:prose-a:underline
                  prose-code:rounded prose-code:bg-surface prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-[0.9em] prose-code:text-kb-text prose-code:before:content-none prose-code:after:content-none
                  prose-pre:rounded-xl prose-pre:border prose-pre:border-line prose-pre:bg-surface prose-pre:text-[0.88rem]
                  prose-strong:text-kb-text
                  prose-hr:border-line
                  prose-blockquote:border-accent/40 prose-blockquote:text-muted/70
                  prose-th:text-kb-text prose-td:text-muted/70
                ">
                  {readmeContent}
                </article>
              ) : paragraphs.length > 0 ? (
                <section className="flex flex-col gap-4">
                  <h2 className="text-base font-semibold text-kb-text">{t('marketplace.detail.aboutTitle')}</h2>
                  {paragraphs.map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-muted/70">{p}</p>
                  ))}
                </section>
              ) : null}

              {/* Commands */}
              {item.commands && item.commands.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h2 className="text-base font-semibold text-kb-text">{t('marketplace.detail.commandsTitle')}</h2>
                  <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
                    {item.commands.map((cmd) => (
                      <div key={cmd} className="flex items-center gap-4 px-4 py-3">
                        <code className="font-mono text-sm text-kb-text">kb {cmd}</code>
                        <span className="ml-auto font-mono text-xs text-muted/50 dark:text-muted/35">--help</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Requirements */}
              {hasRequirements && (
                <section>
                  <details className="rounded-xl border border-line">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-kb-text select-none">
                      {t('marketplace.detail.requirementsTitle')}
                    </summary>
                    <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-3">
                      {item.permissions && item.permissions.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted/55 dark:text-muted/40">{t('marketplace.detail.permissionsLabel')}</p>
                          {item.permissions.map((p) => (
                            <code key={p} className="font-mono text-xs text-muted/70">{p}</code>
                          ))}
                        </div>
                      )}
                      {item.allowedHosts && item.allowedHosts.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted/55 dark:text-muted/40">{t('marketplace.detail.networkLabel')}</p>
                          {item.allowedHosts.map((h) => (
                            <code key={h} className="font-mono text-xs text-muted/70">{h}</code>
                          ))}
                        </div>
                      )}
                      {item.envVars && item.envVars.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted/55 dark:text-muted/40">{t('marketplace.detail.envLabel')}</p>
                          {item.envVars.map((v) => (
                            <code key={v} className="font-mono text-xs text-muted/70">{v}</code>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </section>
              )}
            </div>

            {/* ── Sidebar ── */}
            <aside className="w-full shrink-0 lg:w-64 lg:sticky lg:top-24 lg:self-start">
              {/* Stats */}
              <dl className="flex flex-col divide-y divide-line rounded-xl border border-line overflow-hidden">
                {statsRows.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                    <dt className="text-[0.78rem] text-muted/50 shrink-0">{label}</dt>
                    <dd className="font-mono text-[0.78rem] font-medium text-kb-text text-right">{value}</dd>
                  </div>
                ))}
              </dl>

              {/* Tags */}
              {item.tags.length > 0 && (
                <div className="mt-5 flex flex-col gap-2">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted/55 dark:text-muted/40">
                    {t('marketplace.detail.tagsLabel')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-md border border-line px-2 py-0.5 font-mono text-[0.68rem] text-muted/60">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </aside>

          </div>
        </Container>
      </main>
      <SiteFooter />

    </>
  );
}
