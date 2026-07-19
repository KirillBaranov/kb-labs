import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { DocsHeader } from './DocsHeader';
import { DocsBodyWrapper } from './DocsBodyWrapper';
import { DocsFeedback } from './DocsFeedback';
import { DocsSidebar } from './DocsSidebar';
import { DocsToc } from './DocsToc';
import { TranslationBanner } from './TranslationBanner';
import type { TocItem } from './DocsToc';
import { buildNavFromContent } from '@/nav.config';
import s from './DocsLayout.module.css';

type DocsLayoutProps = {
  children: React.ReactNode;
  locale: string;
  toc: TocItem[];
  slug: string[];
  isFallback: boolean;
  isIndex?: boolean;
  pageTitle?: string;
  pageDescription?: string;
  pageUpdatedAt?: string;
};

type Breadcrumb = {
  section: string;
  sectionHref: string;
  label: string;
  pageHref: string;
};

function findBreadcrumb(nav: ReturnType<typeof buildNavFromContent>, locale: string, slug: string[], pageTitle?: string): Breadcrumb | null {
  const pageHref = `/${locale}/` + slug.join('/');
  const items = nav.flatMap((group) =>
    group.items.map((item) => ({ section: group.title, ...item }))
  );

  const exact = items.find((item) => item.href === pageHref);
  if (exact) {
    return {
      section: exact.section,
      sectionHref: exact.href,
      label: exact.label,
      pageHref: exact.href,
    };
  }

  const prefixMatch = items
    .filter((item) => pageHref.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  if (prefixMatch) {
    return {
      section: prefixMatch.section,
      sectionHref: prefixMatch.href,
      label: pageTitle ?? humanizeSlugSegment(slug[slug.length - 1] ?? 'page'),
      pageHref,
    };
  }

  return null;
}

function humanizeSlugSegment(value: string): string {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function renderBreadcrumb(crumb: Breadcrumb) {
  return (
    <>
      <Link href={crumb.sectionHref} className={s.breadcrumbLink}>
        {crumb.section}
      </Link>
      <span className={s.breadcrumbSep}>/</span>
      <span className={s.breadcrumbCurrent}>{crumb.label}</span>
    </>
  );
}

function formatDate(raw: string, locale: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function DocsLayout({ children, locale, toc, slug, isFallback, isIndex, pageTitle, pageDescription, pageUpdatedAt }: DocsLayoutProps) {
  const t = await getTranslations('page');
  const nav = buildNavFromContent(locale);
  const crumb = findBreadcrumb(nav, locale, slug, pageTitle);

  const editLocale = isFallback ? 'en' : locale;
  const editFilePath = isIndex ? `${slug.join('/')}/index` : slug.join('/');
  const editUrl = `https://github.com/kb-labs-team/kb-labs/blob/main/sites/web/apps/docs/content/${editLocale}/${editFilePath}.mdx`;

  const sidebarSlot = <DocsSidebar nav={nav} />;
  const tocSlot = <DocsToc items={toc} />;
  const contentSlot = (
    <>
      {crumb && (
        <nav className={s.breadcrumb} aria-label="Breadcrumb">
          <Link href={`/${locale}/quick-start`} className={s.breadcrumbLink}>
            KB Labs
          </Link>
          <span className={s.breadcrumbSep}>/</span>
          {renderBreadcrumb(crumb)}
        </nav>
      )}
      <article className={`prose ${s.article}`}>
        {isFallback && locale !== 'en' && <TranslationBanner slug={slug} />}
        {pageTitle && (
          <div className={s.pageHeader}>
            <h1>{pageTitle}</h1>
            {pageUpdatedAt && (
              <p className={s.pageUpdatedAt}>{t('lastUpdated')} {formatDate(pageUpdatedAt, locale)}</p>
            )}
            <hr className={s.pageHeaderDivider} />
            {pageDescription && <p className={s.pageDescription}>{pageDescription}</p>}
          </div>
        )}
        {children}
      </article>
      <footer className={s.pageFooter}>
        <a
          href={editUrl}
          className={s.editLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('editOnGithub')}
        </a>
        <DocsFeedback />
      </footer>
    </>
  );

  return (
    <div className={s.root}>
      <DocsHeader locale={locale} slug={slug} />
      <DocsBodyWrapper sidebar={sidebarSlot} toc={tocSlot}>
        {contentSlot}
      </DocsBodyWrapper>
    </div>
  );
}
