import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  AnimateOnScroll,
  Container,
  DotPattern,
  Eyebrow,
  GlowCard,
  Section,
} from '@kb-labs/web-site-ui';
import {
  Bug,
  FileText,
  Github,
  Mail,
  MessageCircle,
  Users,
} from 'lucide-react';
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
    title: t('contactMetaTitle'),
    description: t('contactMetaDesc'),
    path: '/contact',
    imageSegment: 'contact',
  });
}

// Map icon keys to lucide components
const CHANNEL_ICONS = [Mail, Bug, Users, FileText];
const COMMUNITY_ICONS = [Github, MessageCircle];

type ChannelItem = { label: string; description: string; action: string; href: string; external: boolean };
type CommunityItem = { label: string; description: string; href: string };

export default async function ContactPage({ params }: Props) {
  const { locale: _locale } = await params;
  setRequestLocale(_locale);

  const t = await getTranslations({ locale: _locale, namespace: 'page' });
  const channels = t.raw('contactChannels') as ChannelItem[];
  const community = t.raw('contactCommunity') as CommunityItem[];

  return (
    <>
      <SiteHeader />
      <main>

        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line py-10 pb-8 sm:py-20 sm:pb-16">
          <DotPattern className="absolute inset-0 z-0 opacity-40" />
          <Container className="relative z-10">
            <AnimateOnScroll>
              <div className="mx-auto max-w-3xl text-center">
                <Eyebrow className="mb-4">{t('contactHeroEyebrow')}</Eyebrow>
                <h1 className="mb-5 text-4xl font-bold leading-tight tracking-tight text-kb-text sm:text-5xl lg:text-6xl">
                  {t('contactHeroTitle')}
                </h1>
                <p className="mx-auto max-w-xl text-lg leading-relaxed text-muted/70">
                  {t('contactHeroDescription')}
                </p>
              </div>
            </AnimateOnScroll>
          </Container>
        </section>

        {/* Channels */}
        <Section className="border-b border-line">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <Eyebrow className="mb-6">{t('contactChannelsEyebrow')}</Eyebrow>
                <div className="grid gap-3 sm:grid-cols-2">
                  {channels.map((ch, i) => {
                    const Icon = CHANNEL_ICONS[i];
                    return (
                      <AnimateOnScroll key={ch.label} delay={i * 50}>
                        <GlowCard className="flex h-full flex-col rounded-2xl border border-line p-5">
                          <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-line bg-bg text-muted">
                            <Icon size={18} />
                          </div>
                          <p className="mb-1 text-sm font-semibold text-kb-text">{ch.label}</p>
                          <p className="mb-4 flex-1 text-sm leading-relaxed text-muted/60">{ch.description}</p>
                          <a
                            href={ch.href}
                            target={ch.external ? '_blank' : undefined}
                            rel={ch.external ? 'noopener noreferrer' : undefined}
                            className="text-sm text-accent hover:underline underline-offset-4"
                          >
                            {ch.action}
                          </a>
                        </GlowCard>
                      </AnimateOnScroll>
                    );
                  })}
                </div>
              </div>
            </AnimateOnScroll>
          </Container>
        </Section>

        {/* Community + Location */}
        <Section className="bg-surface/40">
          <Container>
            <AnimateOnScroll>
              <div className="mx-auto max-w-2xl">
                <div className="grid gap-10 sm:grid-cols-2 sm:items-stretch">

                  {/* Community */}
                  <div>
                    <Eyebrow className="mb-6">{t('contactCommunityEyebrow')}</Eyebrow>
                    <div className="flex flex-col gap-3">
                      {community.map((item, i) => {
                        const Icon = COMMUNITY_ICONS[i];
                        return (
                          <a
                            key={item.label}
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent/30 hover:bg-surface/80"
                          >
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-bg text-muted">
                              <Icon size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-kb-text">{item.label}</p>
                              <p className="text-sm text-muted/60">{item.description}</p>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>

                  {/* Location + email */}
                  <div className="flex flex-col">
                    <Eyebrow className="mb-6">{t('contactLocationEyebrow')}</Eyebrow>
                    <div className="flex-1 rounded-2xl border border-line bg-surface p-5">
                      <p className="mb-4 text-sm text-muted/70">{t('contactLocationDesc')}</p>
                      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2 text-sm">
                        <span className="text-muted/55 dark:text-muted/40">{t('contactGeneralLabel')}</span>
                        {/* i18n-ignore: email address */}
                        <a href="mailto:hello@kblabs.ru" className="text-kb-text hover:underline underline-offset-4">
                          hello@kblabs.ru
                        </a>
                        <span className="text-muted/55 dark:text-muted/40">{t('contactSecurityLabel')}</span>
                        {/* i18n-ignore: email address */}
                        <a href="mailto:security@kblabs.ru" className="text-kb-text hover:underline underline-offset-4">
                          security@kblabs.ru
                        </a>
                      </div>
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
