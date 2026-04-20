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
    title: t('kbDeploy.meta.title'),
    description: t('kbDeploy.meta.description'),
    path: '/kb-deploy',
  });
}

export default async function KbDeployPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const FEATURES = t.raw('kbDeploy.features.list') as Array<{ title: string; description: string }>;
  const COMMANDS = t.raw('kbDeploy.commands.list') as Array<{ cmd: string; description: string }>;
  const PLATFORMS = t.raw('kbDeploy.download.platforms') as Array<{ platform: string; file: string }>;
  const PAIN_ITEMS = t.raw('kbDeploy.pain.items') as Array<{ scenario: string; fix: string }>;
  const COMPARE_ROWS = t.raw('kbDeploy.compareCompose.rows') as Array<{
    feature: string;
    compose: string;
    kbDeploy: string;
  }>;

  return (
    <>
      <SiteHeader />
      <main>
        {/* ── Hero ── */}
        <section className={s.hero}>
          <span className={s.eyebrow}>{t('kbDeploy.hero.eyebrow')}</span>
          <h1>{t('kbDeploy.hero.title')}</h1>
          <p>{t('kbDeploy.hero.description')}</p>
          <div className={s.heroCta}>
            <PlatformCommand commands={{ unix: t('kbDeploy.hero.installCmd') }} />
            <a
              className="btn"
              href="https://docs.kblabs.ru/services/kb-deploy"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('kbDeploy.hero.docsBtn')}
            </a>
            <a
              className="btn secondary"
              href="https://github.com/KirillBaranov/kb-labs/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('kbDeploy.hero.releasesBtn')}
            </a>
          </div>
        </section>

        {/* ── Pain ── */}
        <section className={s.painSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbDeploy.pain.title')}</h2>
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

        {/* ── Compare with docker compose ── */}
        <section className={s.compareSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbDeploy.compareCompose.title')}</h2>
            <p>{t('kbDeploy.compareCompose.description')}</p>
          </div>
          <div className={s.compareTable}>
            <div className={s.compareHead}>
              <span>{t('kbDeploy.compareCompose.headers.feature')}</span>
              <span>{t('kbDeploy.compareCompose.headers.compose')}</span>
              <span>{t('kbDeploy.compareCompose.headers.kbDeploy')}</span>
            </div>
            {COMPARE_ROWS.map((row) => (
              <div key={row.feature} className={s.compareRow}>
                <span className={s.compareFeature}>{row.feature}</span>
                <span className={s.compareCompose}>{row.compose}</span>
                <span className={s.compareKbDeploy}>{row.kbDeploy}</span>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Config example ── */}
        <section className={s.configSection}>
          <div className={s.configText}>
            <h2>{t('kbDeploy.config.title')}</h2>
            <p>{t('kbDeploy.config.description')}</p>
            <p className={s.configNote}>{t('kbDeploy.config.note')}</p>
          </div>
          <div className={s.configCode}>
            <div className={s.codeHeader}>
              <span className={s.codeFilename}>.kb/deploy.yaml</span>
              <CopyButton text={t('kbDeploy.config.example')} />
            </div>
            <pre className={s.codeBlock}><code>{t('kbDeploy.config.example')}</code></pre>
          </div>
        </section>

        <hr className={s.divider} />

        {/* ── Features grid ── */}
        <section className={s.featuresSection}>
          <div className={s.sectionHeader}>
            <h2>{t('kbDeploy.features.title')}</h2>
            <p>{t('kbDeploy.features.description')}</p>
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
            <h2>{t('kbDeploy.commands.title')}</h2>
            <p>{t('kbDeploy.commands.description')}</p>
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
            <h2>{t('kbDeploy.download.title')}</h2>
            <p>{t('kbDeploy.download.description')}</p>
            <PlatformBinaryTable
              binaries={PLATFORMS}
              downloadLabel={t('kbDeploy.download.downloadBtn')}
              baseUrl="https://github.com/KirillBaranov/kb-labs/releases/latest/download"
              colPlatform={t('kbDeploy.download.colPlatform')}
              colBinary={t('kbDeploy.download.colBinary')}
              colDownload={t('kbDeploy.download.colDownload')}
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
            <h3>{t('kbDeploy.kbLabsNote.title')}</h3>
            <p>{t('kbDeploy.kbLabsNote.description')}</p>
            <Link className={s.link} href={`/${locale}/install`}>
              {t('kbDeploy.kbLabsNote.link')}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
