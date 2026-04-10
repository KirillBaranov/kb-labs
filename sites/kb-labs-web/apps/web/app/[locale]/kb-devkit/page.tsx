import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { CopyButton } from '@/components/CopyButton';
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
    title: t('kbDevkit.meta.title'),
    description: t('kbDevkit.meta.description'),
    path: '/kb-devkit',
  });
}

export default async function KbDevkitPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const FEATURES = t.raw('kbDevkit.features.list') as Array<{ title: string; description: string }>;
  const COMMANDS = t.raw('kbDevkit.commands.list') as Array<{ cmd: string; description: string }>;
  const PLATFORMS = t.raw('kbDevkit.download.platforms') as Array<{ platform: string; file: string }>;
  const PAIN_ITEMS = t.raw('kbDevkit.pain.items') as Array<{ scenario: string; fix: string }>;

  return (
    <>
      <SiteHeader />
      <main>

        {/* ── Hero ── */}
        <section className={s.hero}>
          <span className={s.eyebrow}>{t('kbDevkit.hero.eyebrow')}</span>
          <h1>{t('kbDevkit.hero.title')}</h1>
          <p>{t('kbDevkit.hero.description')}</p>
          <div className={s.heroCta}>
            <div className={s.codeWrap}>
              <pre className={s.heroCode}><code>{t('kbDevkit.hero.installCmd')}</code></pre>
              <CopyButton text={t('kbDevkit.hero.installCmd')} />
            </div>
            <a
              className="btn"
              href="https://docs.kblabs.ru/services/kb-devkit"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('kbDevkit.hero.docsBtn')}
            </a>
            <a
              className="btn secondary"
              href="https://github.com/KirillBaranov/kb-labs/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('kbDevkit.hero.releasesBtn')}
            </a>
          </div>
        </section>

        {/* ── Pain ── */}
        <section className={s.painSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbDevkit.pain.title')}</h2>
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

        {/* ── Config example ── */}
        <section className={s.configSection}>
          <div className={s.configText}>
            <h2>{t('kbDevkit.config.title')}</h2>
            <p>{t('kbDevkit.config.description')}</p>
            <p className={s.configNote}>{t('kbDevkit.config.note')}</p>
          </div>
          <div className={s.configCode}>
            <div className={s.codeHeader}>
              <span className={s.codeFilename}>devkit.yaml</span>
              <CopyButton text={t('kbDevkit.config.example')} />
            </div>
            <pre className={s.codeBlock}><code>{t('kbDevkit.config.example')}</code></pre>
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Features grid ── */}
        <section className={s.featuresSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbDevkit.features.title')}</h2>
            <p>{t('kbDevkit.features.description')}</p>
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
            <h2>{t('kbDevkit.commands.title')}</h2>
            <p>{t('kbDevkit.commands.description')}</p>
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
            <h2>{t('kbDevkit.download.title')}</h2>
            <p>{t('kbDevkit.download.description')}</p>
            <div className={s.platformTable}>
              <div className={s.platformHead}>
                <span>{t('kbDevkit.download.colPlatform')}</span>
                <span>{t('kbDevkit.download.colBinary')}</span>
                <span>{t('kbDevkit.download.colDownload')}</span>
              </div>
              {PLATFORMS.map((item) => (
                <div key={item.file} className={s.platformRow}>
                  <span>{item.platform}</span>
                  <code>{item.file}</code>
                  <a
                    href={`https://github.com/KirillBaranov/kb-labs/releases/latest/download/${item.file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('kbDevkit.download.downloadBtn')}
                  </a>
                </div>
              ))}
            </div>
          </div>
          <div className={s.kbLabsNote}>
            <div className={s.noteIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="1" y="5" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 9l2.5 2.5L5 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9.5 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                <rect x="6" y="2" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
            </div>
            <h3>{t('kbDevkit.kbLabsNote.title')}</h3>
            <p>{t('kbDevkit.kbLabsNote.description')}</p>
            <Link className={s.link} href={`/${locale}/install`}>
              {t('kbDevkit.kbLabsNote.link')}
            </Link>
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
