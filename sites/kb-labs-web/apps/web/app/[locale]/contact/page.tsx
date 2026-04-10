import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { buildPageMetadata } from '@/lib/page-metadata';
import s from './page.module.css';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('contact.meta.title'),
    description: t('contact.meta.description'),
    path: '/contact',
  });
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const channels = t.raw('contact.channels') as {
    label: string;
    description: string;
    action: string;
    href: string;
  }[];
  const community = t.raw('contact.community') as {
    label: string;
    description: string;
    href: string;
  }[];

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <h1>{t('contact.hero.title')}</h1>
          <p>{t('contact.hero.subtitle')}</p>
        </section>

        <div className={s.layout}>
          <div>
            <span className={s.sectionLabel}>{t('contact.channelsTitle')}</span>
            <div className={s.channelList}>
              {channels.map((ch) => (
                <a key={ch.label} className={s.channel} href={ch.href}>
                  <div className={s.channelBody}>
                    <span className={s.channelLabel}>{ch.label}</span>
                    <span className={s.channelDesc}>{ch.description}</span>
                  </div>
                  <span className={s.channelAction}>{ch.action}</span>
                </a>
              ))}
            </div>
          </div>

          <aside className={s.aside}>
            <div className={s.asideBlock}>
              <span className={s.sectionLabel}>{t('contact.communityTitle')}</span>
              <div className={s.communityList}>
                {community.map((item) => (
                  <a key={item.label} className={s.communityItem} href={item.href} target="_blank" rel="noopener noreferrer">
                    <span className={s.communityLabel}>{item.label}</span>
                    <span className={s.communityDesc}>{item.description}</span>
                  </a>
                ))}
              </div>
            </div>

            <div className={s.asideBlock}>
              <span className={s.sectionLabel}>{t('contact.basedIn')}</span>
              <p className={s.location}>
                {t('contact.location').split('\n').map((line, i, arr) => (
                  <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                ))}
              </p>
              <p className={s.emailNote}>
                {t('contact.generalInquiries')} <a href="mailto:hello@kblabs.ru">hello@kblabs.ru</a>
              </p>
            </div>
          </aside>
        </div>

      </main>
      <SiteFooter />
    </>
  );
}
