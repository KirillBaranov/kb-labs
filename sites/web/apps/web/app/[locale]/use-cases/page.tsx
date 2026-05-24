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
  num: string;
  hook: string;
  title: string;
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

        {/* Hero */}
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
                <p className="mx-auto mb-8 max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('ucHeroDescription')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* Use cases list */}
        {ucItems.map((item, index) => (
          <Section
            key={item.title}
            className={`border-b border-line${index % 2 === 1 ? ' bg-surface/40' : ''}`}
          >
            <Container>
              <AnimateOnScroll>
                <div className="grid gap-10 lg:grid-cols-[120px,1fr]">
                  {/* Left: number */}
                  <div className="flex items-start">
                    <span className="text-5xl font-bold text-muted/15">{item.num}</span>
                  </div>

                  {/* Right: content */}
                  <div>
                    <p className="mb-2 text-sm italic text-muted/50">{item.hook}</p>
                    <h2 className="mb-4 text-2xl font-bold text-kb-text">{item.title}</h2>

                    {/* 3-column grid */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <span className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-widest text-muted/40">
                          {t('ucSituationLabel')}
                        </span>
                        <p className="text-sm leading-relaxed text-muted/70">{item.situation}</p>
                      </div>
                      <div>
                        <span className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-widest text-muted/40">
                          {t('ucHowLabel')}
                        </span>
                        <p className="text-sm leading-relaxed text-muted/70">{item.how}</p>
                      </div>
                      <div>
                        <span className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-widest text-muted/40">
                          {t('ucResultLabel')}
                        </span>
                        <p className="text-sm leading-relaxed text-muted/70">{item.result}</p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm text-muted/40">{t('ucOwnerLabel')} {item.owner}</p>
                  </div>
                </div>
              </AnimateOnScroll>
            </Container>
          </Section>
        ))}

        {/* CTA */}
        <Section className="bg-bg">
          <Container>
            <AnimateOnScroll>
              <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-8 py-16 text-center">
                <BorderBeam />
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
            </AnimateOnScroll>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
