import Link from 'next/link';
import { DocsHeader } from './DocsHeader';
import { DocsFeedback } from './DocsFeedback';
import { DocsSidebar } from './DocsSidebar';
import { DocsToc } from './DocsToc';
import type { TocItem } from './DocsToc';
import { NAV } from '@/nav.config';
import s from './DocsLayout.module.css';

type DocsLayoutProps = {
  children: React.ReactNode;
  toc: TocItem[];
  slug: string[];
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

function findBreadcrumb(slug: string[], pageTitle?: string): Breadcrumb | null {
  const pageHref = '/' + slug.join('/');
  const items = NAV.flatMap((group) =>
    group.items.map((item) => ({ section: group.title, ...item }))
  );

  // Exact match first
  const exact = items.find((item) => item.href === pageHref);
  if (exact) {
    return {
      section: exact.section,
      sectionHref: exact.href,
      label: exact.label,
      pageHref: exact.href,
    };
  }

  // Fallback: nearest prefix match for nested pages
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

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function DocsLayout({ children, toc, slug, pageTitle, pageDescription, pageUpdatedAt }: DocsLayoutProps) {
  const crumb = findBreadcrumb(slug, pageTitle);

  return (
    <div className={s.root}>
      <DocsHeader />
      <div className={s.body}>
          <aside className={s.sidebar}>
            <DocsSidebar nav={NAV} />
          </aside>
          <main className={s.content}>
            {crumb && (
              <nav className={s.breadcrumb} aria-label="Breadcrumb">
                <Link href="/quick-start" className={s.breadcrumbLink}>
                  KB Labs
                </Link>
                <span className={s.breadcrumbSep}>/</span>
                {renderBreadcrumb(crumb)}
              </nav>
            )}
            <article className={`prose ${s.article}`}>
              {pageTitle && (
                <div className={s.pageHeader}>
                  <h1>{pageTitle}</h1>
                  {pageUpdatedAt && (
                    <p className={s.pageUpdatedAt}>Last updated {formatDate(pageUpdatedAt)}</p>
                  )}
                  <hr className={s.pageHeaderDivider} />
                  {pageDescription && <p className={s.pageDescription}>{pageDescription}</p>}
                </div>
              )}
              {children}
            </article>
            <footer className={s.pageFooter}>
              <a
                href={`https://github.com/KirillBaranov/kb-labs/blob/main/sites/web/apps/docs/content/${slug.join('/')}.mdx`}
                className={s.editLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                Edit this page on GitHub →
              </a>
              <DocsFeedback />
            </footer>
          </main>
          <aside className={s.toc}>
            <DocsToc items={toc} />
          </aside>
      </div>
    </div>
  );
}
