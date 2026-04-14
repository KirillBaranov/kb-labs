import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { CopyButton } from '@/components/CopyButton';
import { PlatformCommand, PlatformBinaryTable } from '@/components/platform';
import s from './page.module.css';
import { buildPageMetadata } from '@/lib/page-metadata';

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return buildPageMetadata({
    locale,
    title: t('kbMonitor.meta.title'),
    description: t('kbMonitor.meta.description'),
    path: '/kb-monitor',
  });
}

export default async function KbMonitorPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const FEATURES = t.raw('kbMonitor.features.list') as Array<{ title: string; description: string }>;
  const COMMANDS = t.raw('kbMonitor.commands.list') as Array<{ cmd: string; description: string }>;
  const PLATFORMS = t.raw('kbMonitor.download.platforms') as Array<{ platform: string; file: string }>;
  const PAIN_ITEMS = t.raw('kbMonitor.pain.items') as Array<{ scenario: string; fix: string }>;

  return (
    <>
      <SiteHeader />
      <main>
        {/* ── Hero ── */}
        <section className={s.hero}>
          <span className={s.eyebrow}>{t('kbMonitor.hero.eyebrow')}</span>
          <h1>{t('kbMonitor.hero.title')}</h1>
          <p>{t('kbMonitor.hero.description')}</p>
          <div className={s.heroCta}>
            <PlatformCommand commands={{ unix: t('kbMonitor.hero.installCmd'), windows: 'iwr https://kblabs.ru/kb-monitor/install.ps1 | iex' }} />
            <a
              className="btn"
              href="https://docs.kblabs.ru/services/kb-monitor"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('kbMonitor.hero.docsBtn')}
            </a>
            <a
              className="btn secondary"
              href="https://github.com/KirillBaranov/kb-labs/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('kbMonitor.hero.releasesBtn')}
            </a>
          </div>
        </section>

        {/* ── Pain ── */}
        <section className={s.painSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbMonitor.pain.title')}</h2>
          </div>
          <div className={s.painGrid}>
            {PAIN_ITEMS.map((item, i) => (
              <div key={i} className={s.painCard}>
                <p className={s.painScenario}>{item.scenario}</p>
                <p className={s.painFix}>{item.fix}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Agent-as-watchdog ── */}
        <section className={s.agentSection}>
          <div className={s.agentText}>
            <h2>{t('kbMonitor.agentWatchdog.title')}</h2>
            <p>{t('kbMonitor.agentWatchdog.description')}</p>
            <p className={s.configNote}>{t('kbMonitor.agentWatchdog.note')}</p>
          </div>
          <div className={s.configCode}>
            <div className={s.codeHeader}>
              <span className={s.codeFilename}>{t('kbMonitor.agentWatchdog.codeCaption')}</span>
              <CopyButton text={t('kbMonitor.agentWatchdog.codeExample')} />
            </div>
            <pre className={s.codeBlock}><code>{t('kbMonitor.agentWatchdog.codeExample')}</code></pre>
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Config example ── */}
        <section className={s.configSection}>
          <div className={s.configText}>
            <h2>{t('kbMonitor.config.title')}</h2>
            <p>{t('kbMonitor.config.description')}</p>
            <p className={s.configNote}>{t('kbMonitor.config.note')}</p>
          </div>
          <div className={s.configCode}>
            <div className={s.codeHeader}>
              <span className={s.codeFilename}>.kb/deploy.yaml</span>
              <CopyButton text={t('kbMonitor.config.example')} />
            </div>
            <pre className={s.codeBlock}><code>{t('kbMonitor.config.example')}</code></pre>
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Features grid ── */}
        <section className={s.featuresSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbMonitor.features.title')}</h2>
            <p>{t('kbMonitor.features.description')}</p>
          </div>
          <div className={s.featuresGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={s.featureCard}>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Commands ── */}
        <section className={s.commandsSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbMonitor.commands.title')}</h2>
            <p>{t('kbMonitor.commands.description')}</p>
          </div>
          <div className={s.commandsTable}>
            {COMMANDS.map((item) => (
              <div key={item.cmd} className={s.commandRow}>
                <div className={s.codeWrap}>
                  <pre className={s.codeBlock}><code>{item.cmd}</code></pre>
                  <CopyButton text={item.cmd} />
                </div>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Download + KB Labs note ── */}
        <section className={s.twoCol}>
          <div>
            <h2>{t('kbMonitor.download.title')}</h2>
            <p>{t('kbMonitor.download.description')}</p>
            <PlatformBinaryTable
              binaries={PLATFORMS}
              downloadLabel={t('kbMonitor.download.downloadBtn')}
              baseUrl="https://github.com/KirillBaranov/kb-labs/releases/latest/download"
              colPlatform={t('kbMonitor.download.colPlatform')}
              colBinary={t('kbMonitor.download.colBinary')}
              colDownload={t('kbMonitor.download.colDownload')}
            />
          </div>
          <div className={s.kbLabsNote}>
            <div className={s.noteIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              </svg>
            </div>
            <h3>{t('kbMonitor.kbLabsNote.title')}</h3>
            <p>{t('kbMonitor.kbLabsNote.description')}</p>
            <Link className={s.link} href={`/${locale}/install`}>
              {t('kbMonitor.kbLabsNote.link')}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
