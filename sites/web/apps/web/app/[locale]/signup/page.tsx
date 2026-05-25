import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { WaitlistForm } from '@/components/WaitlistForm';
import { buildPageMetadata } from '@/lib/page-metadata';
import {
  AnimateOnScroll,
  Container,
  DotPattern,
  Eyebrow,
  GradientText,
  Section,
} from '@kb-labs/web-site-ui';
import { CloudUpload, ListChecks, MessageCircle } from 'lucide-react';

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
  });
}

export default async function SignupPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });

  const PERKS = [
    {
      icon: CloudUpload,
      label: t('signup.perks.0.label'),
      description: t('signup.perks.0.description'),
    },
    {
      icon: ListChecks,
      label: t('signup.perks.1.label'),
      description: t('signup.perks.1.description'),
    },
    {
      icon: MessageCircle,
      label: t('signup.perks.2.label'),
      description: t('signup.perks.2.description'),
    },
  ];

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line py-20 pb-16">
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
                <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">

                  {/* Left — perks */}
                  <div className="flex flex-col gap-6 pt-1">
                    {PERKS.map((perk) => {
                      const Icon = perk.icon;
                      return (
                        <div key={perk.label} className="flex gap-4">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-accent">
                            <Icon size={16} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-kb-text">{perk.label}</p>
                            <p className="mt-0.5 text-sm leading-relaxed text-muted/60">{perk.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right — form */}
                  <div className="rounded-2xl border border-line bg-surface p-6 lg:p-8">
                    <div>
                      <h2 className="mb-1 text-xl font-semibold text-kb-text">{t('signup.form.title')}</h2>
                      <p className="mb-6 text-sm text-muted/55">
                        {t('signup.form.description')}
                      </p>
                      <WaitlistForm />
                      <p className="mt-5 text-xs text-muted/50 dark:text-muted/35">
                        {t('signup.form.notePrefix')}{' '}
                        <Link
                          href={`/${locale}/legal/privacy`}
                          className="underline underline-offset-2 hover:text-muted/60 transition-colors"
                        >
                          {t('signup.form.privacyLink')}
                        </Link>
                        {t('signup.form.noteSuffix')}
                      </p>
                    </div>
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
