import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { routing } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/page-metadata';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'extensions' });
  return buildPageMetadata({
    locale,
    title: t('meta.title'),
    description: t('meta.description'),
    path: '/extensions',
    imageSegment: 'default',
  });
}

type Extension = { title: string; description: string; command: string; note: string };

export default async function ExtensionsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'extensions' });
  const extensions = t.raw('items') as Extension[];

  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-line py-12 sm:py-20">
          <DotPattern className="absolute inset-0 opacity-40" />
          <Container className="relative z-10">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow className="mb-4">{t('hero.eyebrow')}</Eyebrow>
              <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                {t('hero.title')}{' '}<GradientText>{t('hero.titleHighlight')}</GradientText>
              </h1>
              <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted/70">{t('hero.description')}</p>
            </div>
          </Container>
        </section>

        <Section>
          <Container>
            <div className="grid gap-5 lg:grid-cols-3">
              {extensions.map((extension, index) => (
                <AnimateOnScroll key={extension.title} animation="slide-up" delay={index * 70}>
                  <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6">
                    <p className="mb-4 font-mono text-xs text-accent">{index === 0 ? 'OPTIONAL' : `0${index}`}</p>
                    <h2 className="mb-3 text-2xl font-bold tracking-tight text-kb-text">{extension.title}</h2>
                    <p className="mb-6 text-sm leading-relaxed text-muted">{extension.description}</p>
                    <p className="mb-3 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-kb-text">{extension.command}</p>
                    <p className="mt-auto text-sm text-muted/80">{extension.note}</p>
                  </article>
                </AnimateOnScroll>
              ))}
            </div>
          </Container>
        </Section>

        <Section className="bg-surface/40">
          <Container>
            <div className="relative overflow-hidden rounded-3xl border border-line bg-bg px-6 py-12 text-center sm:px-10">
              <BorderBeam />
              <div className="relative z-10">
                <Eyebrow className="mb-3">{t('cta.eyebrow')}</Eyebrow>
                <h2 className="mb-3 text-3xl font-bold tracking-tight text-kb-text">{t('cta.title')}</h2>
                <p className="mx-auto mb-7 max-w-xl text-muted/70">{t('cta.description')}</p>
                <Button size="lg" href={`/${locale}/install`}>{t('cta.button')}</Button>
              </div>
            </div>
          </Container>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
