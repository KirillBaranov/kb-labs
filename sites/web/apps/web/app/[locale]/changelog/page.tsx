import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import { Container, Section } from '@kb-labs/web-site-ui';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('changelog.meta.title'),
    description: t('changelog.meta.description'),
    path: '/changelog',
    imageSegment: 'changelog',
  });
}

type ChangeItem = {
  type: 'new' | 'improved' | 'fixed';
  text: string;
};

type Release = {
  version: string;
  date: string;
  summary: string;
  changes: ChangeItem[];
};

const typeStyles: Record<ChangeItem['type'], string> = {
  new: 'bg-accent/15 text-accent',
  improved: 'bg-blue-500/15 text-blue-400',
  fixed: 'bg-orange-500/15 text-orange-400',
};

export default async function ChangelogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const releases = t.raw('changelog.releases') as Release[];

  const typeLabel: Record<ChangeItem['type'], string> = {
    new: t('changelog.typeNew'),
    improved: t('changelog.typeImproved'),
    fixed: t('changelog.typeFixed'),
  };

  return (
    <>
      <SiteHeader />
      <main>

        <Section className="border-b border-line">
          <Container>
            <div className="py-16 text-center">
              <h1 className="text-4xl font-bold tracking-tight text-kb-text sm:text-5xl">
                {t('changelog.hero.title')}
              </h1>
              <p className="mt-4 text-lg text-muted/70">{t('changelog.hero.subtitle')}</p>
            </div>
          </Container>
        </Section>

        <Section>
          <Container>
            <div className="py-12 flex flex-col gap-10">
              {releases.map((release) => (
                <div key={release.version} className="flex flex-col gap-5 sm:flex-row sm:gap-10">
                  {/* Left: version + date */}
                  <div className="shrink-0 sm:w-32 sm:pt-1">
                    <span className="font-mono text-sm font-semibold text-kb-text">{release.version}</span>
                    <p className="mt-0.5 text-xs text-muted/50">{release.date}</p>
                  </div>

                  {/* Right: content */}
                  <div className="flex-1 rounded-xl border border-line bg-surface/30 p-5 flex flex-col gap-4">
                    <p className="text-sm leading-relaxed text-muted/70">{release.summary}</p>
                    <ul className="flex flex-col gap-2.5">
                      {release.changes.map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${typeStyles[item.type]}`}>
                            {typeLabel[item.type]}
                          </span>
                          <span className="text-sm text-muted/80">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
