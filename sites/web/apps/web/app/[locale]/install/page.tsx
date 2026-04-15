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
    title: t('install.meta.title'),
    description: t('install.meta.description'),
    path: '/install',
  });
}

function renderWithCode(text: string, codeClassName: string) {
  const parts = text.split('{code}');
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts[0]}<code className={codeClassName}>kb-create</code>{parts[1]}
    </>
  );
}

const INSTALL_COMMANDS = {
  unix: 'curl -fsSL https://kblabs.ru/install.sh | sh',
  windows: 'iwr https://kblabs.ru/install.ps1 | iex',
};

// Fallback used when the GitHub API is unreachable at build/render time.
// Kept as the last known-good tag so copy-paste still resolves to real assets.
const FALLBACK_TAG = 'v0.4.0-binaries';

/**
 * Fetches the latest `v*-binaries` release tag so the page never goes stale.
 * Cached for an hour — the docs don't need second-by-second freshness.
 */
async function getLatestBinariesTag(): Promise<string> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/KirillBaranov/kb-labs/releases?per_page=20',
      { next: { revalidate: 3600 }, headers: { Accept: 'application/vnd.github+json' } },
    );
    if (!res.ok) return FALLBACK_TAG;
    const releases = (await res.json()) as Array<{ tag_name?: string; draft?: boolean }>;
    const hit = releases.find(
      (r) => !r.draft && typeof r.tag_name === 'string' && r.tag_name.endsWith('-binaries'),
    );
    return hit?.tag_name ?? FALLBACK_TAG;
  } catch {
    return FALLBACK_TAG;
  }
}

export default async function InstallPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });

  const STEPS = t.raw('install.quickInstall.steps') as Array<{ num: string; title: string; cmd: string; note: string }>;
  const BINARIES = t.raw('install.binaries.platforms') as Array<{ platform: string; file: string }>;
  const NEXT_STEPS = t.raw('install.afterInstall.steps') as Array<{ title: string; cmd?: string; href?: string; label?: string }>;
  const PREREQUISITES = t.raw('install.prerequisites.items') as string[];
  const latestTag = await getLatestBinariesTag();
  const pinUnix = `curl -fsSL https://kblabs.ru/install.sh | sh -s -- --version ${latestTag}`;
  const pinWindows = `iwr https://kblabs.ru/install.ps1 -OutFile install.ps1; .\\install.ps1 -Version ${latestTag}`;
  const checksumCmd = `curl -fsSL https://github.com/KirillBaranov/kb-labs/releases/download/${latestTag}/checksums.txt | grep kb-create-linux-amd64`;

  // Step 01 is install — platform-dependent. Steps 02+ are universal.
  const [installStep, ...restSteps] = STEPS;

  return (
    <>
      <SiteHeader />
      <main>

        <section className={s.hero}>
          <span className={s.eyebrow}>{t('install.hero.eyebrow')}</span>
          <h1>{t('install.hero.title')}</h1>
          <p>{renderWithCode(t.raw('install.hero.description') as string, s.inlineCode)}</p>
          <div className={s.heroCta}>
            <PlatformCommand commands={INSTALL_COMMANDS} />
            <a className="btn secondary" href="https://github.com/KirillBaranov/kb-labs/releases/latest" target="_blank" rel="noopener noreferrer">
              {t('install.hero.releasesBtn')}
            </a>
          </div>
        </section>

        <section className={s.prerequisitesSection}>
          <div className={s.sectionHeader}>
            <h2>{t('install.prerequisites.title')}</h2>
          </div>
          <ul className={s.prerequisitesList}>
            {PREREQUISITES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className={s.stepsSection}>
          <div className={s.sectionHeader}>
            <h2>{t('install.quickInstall.title')}</h2>
            <p>{t('install.quickInstall.description')}</p>
          </div>
          <div className={s.stepList}>
            {/* Step 01: platform-aware install command */}
            {installStep && (
              <div key={installStep.num} className={s.stepRow}>
                <span className={s.stepNum}>{installStep.num}</span>
                <div className={s.stepContent}>
                  <h3>{installStep.title}</h3>
                  <PlatformCommand commands={INSTALL_COMMANDS} />
                  <p>{installStep.note}</p>
                </div>
              </div>
            )}
            {/* Steps 02+: universal */}
            {restSteps.map((step) => (
              <div key={step.num} className={s.stepRow}>
                <span className={s.stepNum}>{step.num}</span>
                <div className={s.stepContent}>
                  <h3>{step.title}</h3>
                  <div className={s.codeWrap}>
                    <pre className={s.codeBlock}><code>{step.cmd}</code></pre>
                    <CopyButton text={step.cmd} />
                  </div>
                  <p>{step.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <hr className={s.divider} />

        <section className={s.twoCol}>
          <div>
            <h2>{t('install.pinVersion.title')}</h2>
            <p>{t('install.pinVersion.description')}</p>
            <PlatformCommand
              commands={{
                unix: pinUnix,
                windows: pinWindows,
              }}
            />
            <h3 className={s.subhead}>{t('install.pinVersion.checksumTitle')}</h3>
            <div className={s.codeWrap}>
              <pre className={s.codeBlock}>
                <code>{checksumCmd}</code>
              </pre>
              <CopyButton text={checksumCmd} />
            </div>
          </div>
          <div className={s.enterpriseNote}>
            <div className={s.noteIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1.5L2.5 4.5V9c0 3.9 2.8 6.6 6.5 7.5 3.7-.9 6.5-3.6 6.5-7.5V4.5L9 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>{t('install.enterprise.title')}</h3>
            <p>{renderWithCode(t.raw('install.enterprise.description') as string, s.inlineCode)}</p>
            <Link className={s.link} href={`/${locale}/enterprise`}>{t('install.enterprise.link')}</Link>
          </div>
        </section>

        <hr className={s.divider} />

        <section className={s.binarySection}>
          <div className={s.sectionHeader}>
            <h2>{t('install.binaries.title')}</h2>
            <p>{t('install.binaries.description').replace('{code}', 'curl | sh')}</p>
          </div>
          <PlatformBinaryTable
            binaries={BINARIES}
            downloadLabel={t('install.binaries.downloadBtn')}
            baseUrl="https://github.com/KirillBaranov/kb-labs/releases/latest/download"
            colPlatform={t('install.binaries.colPlatform')}
            colBinary={t('install.binaries.colBinary')}
            colDownload={t('install.binaries.colDownload')}
          />
        </section>

        <hr className={s.divider} />

        <section className={s.nextSection}>
          <h2>{t('install.afterInstall.title')}</h2>
          <div className={s.nextGrid}>
            {NEXT_STEPS.map((step) => (
              <div key={step.title} className={s.nextCard}>
                <h3>{step.title}</h3>
                {step.cmd && (
                  <div className={s.codeWrap}>
                    <pre className={s.codeBlock}><code>{step.cmd}</code></pre>
                    <CopyButton text={step.cmd} />
                  </div>
                )}
                {step.href && (
                  step.href.startsWith('http') ? (
                    <a className={s.link} href={step.href} target="_blank" rel="noopener noreferrer">
                      {step.label}
                    </a>
                  ) : (
                    <Link className={s.link} href={step.href}>
                      {step.label}
                    </Link>
                  )
                )}
              </div>
            ))}
          </div>
        </section>

      </main>
      <SiteFooter />
    </>
  );
}
