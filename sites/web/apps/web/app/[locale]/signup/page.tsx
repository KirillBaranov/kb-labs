import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SignupFormCard } from '@/components/SignupFormCard';
import { buildPageMetadata } from '@/lib/page-metadata';
import {
  AnimateOnScroll,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
} from '@kb-labs/web-site-ui';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('signup.meta.title'),
    description: t('signup.meta.description'),
    path: '/signup',
    imageSegment: 'default',
  });
}

export default async function SignupPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, messages] = await Promise.all([
    getTranslations({ locale }),
    getMessages(),
  ]);


  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-10 pb-8 sm:py-20 sm:pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl text-center">
                <Eyebrow className="mb-4">{t('signup.eyebrow')}</Eyebrow>
                <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl">
                  {t('signup.hero.titlePrefix')}{' '}
                  <GradientText>{t('signup.hero.titleHighlight')}</GradientText>
                </h1>
                <p className="mx-auto max-w-lg text-lg leading-relaxed text-muted/70">
                  {t('signup.description')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* ── Main ── */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-4xl">
                <NextIntlClientProvider messages={{ signup: messages.signup as Record<string, unknown> }}>
                <SignupFormCard
                  locale={locale}
                  perks={[
                    { label: t('signup.perks.0.label'), description: t('signup.perks.0.description') },
                    { label: t('signup.perks.1.label'), description: t('signup.perks.1.description') },
                    { label: t('signup.perks.2.label'), description: t('signup.perks.2.description') },
                  ]}
                  formTitle={t('signup.form.title')}
                  formDescription={t('signup.form.description')}
                  formNotePrefix={t('signup.form.notePrefix')}
                  formNoteLink={t('signup.form.privacyLink')}
                  formNoteSuffix={t('signup.form.noteSuffix')}
                  successMessage={t('signup.form.success')}
                />
                </NextIntlClientProvider>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

      </main>
      <SiteFooter />
    </>
  );
}
