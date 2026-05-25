import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  BorderBeam,
  Button,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
} from '@kb-labs/web-site-ui';
import { buildPageMetadata } from '@/lib/page-metadata';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'page' });
  return buildPageMetadata({
    locale,
    title: t('ucMetaTitle'),
    description: t('ucMetaDesc'),
    path: '/use-cases',
  });
}

type UseCaseItem = {
  title: string;
  hook: string;
  situation: string;
  how: string;
  result: string;
  owner: string;
};

export default async function UseCasesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'page' });
  const ucItems = t.raw('ucItems') as UseCaseItem[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-20 pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <Eyebrow className="mb-4">{t('ucHeroEyebrow')}</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('ucHeroTitle')}{' '}
                  <GradientText>{t('ucHeroTitleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('ucHeroDescription')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Use cases ── */}
        {ucItems.map((item, index) => (
          <Section
            key={item.title}
            className={`border-b border-line${index % 2 === 1 ? ' bg-surface/40' : ''}`}
          >
            <Container>
              <AnimateOnScroll>
                <div className="grid gap-10 lg:grid-cols-[80px_1fr]">

                  {/* Number */}
                  <div className="hidden lg:flex lg:items-start lg:pt-1">
                    <span className="font-mono text-5xl font-bold text-muted/10 select-none">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Content */}
                  <div>
                    <p className="mb-2 text-sm italic text-muted/45">{item.hook}</p>
                    <h2 className="mb-8 text-2xl font-bold tracking-tight text-kb-text">{item.title}</h2>

                    <div className="grid gap-8 sm:grid-cols-3">
                      <div>
                        <span className="mb-2 block text-[0.6rem] font-bold uppercase tracking-wider text-muted/35">
                          {t('ucSituationLabel')}
                        </span>
                        <p className="text-sm leading-relaxed text-muted/65">{item.situation}</p>
                      </div>
                      <div>
                        <span className="mb-2 block text-[0.6rem] font-bold uppercase tracking-wider text-muted/35">
                          {t('ucHowLabel')}
                        </span>
                        <p className="text-sm leading-relaxed text-muted/65">{item.how}</p>
                      </div>
                      <div>
                        <span className="mb-2 block text-[0.6rem] font-bold uppercase tracking-wider text-muted/35">
                          {t('ucResultLabel')}
                        </span>
                        <p className="text-sm leading-relaxed text-muted/65">{item.result}</p>
                      </div>
                    </div>

                    <p className="mt-8 text-[0.72rem] text-muted/35">
                      {t('ucOwnerLabel')} {item.owner}
                    </p>
                  </div>

                </div>
              </AnimateOnScroll>
            </Container>
          </Section>
        ))}

        {/* ── CTA ── */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
                <BorderBeam />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.06] blur-[90px]" />
                <div className="relative z-10">
                  <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">
                    {t('ucCtaTitle')}
                  </h2>
                  <p className="mx-auto mb-8 max-w-lg text-base leading-relaxed text-muted/70">
                    {t('ucCtaDescription')}
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="primary" size="lg" href={`/${locale}/install`}>
                      {t('ucCtaInstallBtn')}
                    </Button>
                    <Button variant="secondary" size="lg" href={`/${locale}/contact`}>
                      {t('ucCtaContactBtn')}
                    </Button>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
