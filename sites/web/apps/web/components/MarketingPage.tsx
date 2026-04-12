import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

type MarketingPageProps = {
  locale: string;
  slug: string;
  title: string;
  description: string;
  content: React.ReactNode;
};

export function MarketingPage({ locale, slug, title, description, content }: MarketingPageProps) {
  const isHome = slug === '/';
  const heroTitle = isHome ? 'Move from script chaos to managed automation in hours.' : title;
  const heroDescription = isHome
    ? 'KB Labs is a plugin-first platform for engineering teams replacing fragile CI/script glue with policy-first, observable workflows.'
    : description;

  return (
    <>
      <SiteHeader />
      <main className="page">
        <section className={`hero-screen reveal ${isHome ? 'home' : ''}`}>
          <div className="hero-main">
            <h1 className="title">{heroTitle}</h1>
            <p className="subtitle">{heroDescription}</p>
            <div className="cta-row">
              <Link className="btn primary" href={`/${locale}/install`}>
                Install On-Prem
              </Link>
              <a className="btn secondary" href="https://docs.kblabs.ru">
                Open docs
              </a>
            </div>
          </div>
        </section>

        <div className="container stack">
          <section className="proof reveal">
            <span>Trusted by teams building automation products</span>
            <div className="proof-row">
              <span>FAST DEPLOYS</span>
              <span>EDGE DELIVERY</span>
              <span>OSS CORE</span>
              <span>ENTERPRISE SLA</span>
            </div>
          </section>
          <section className="feature-grid reveal">
            <article className="feature-card">
              <h3>Build and ship faster</h3>
              <p>From Git push to production with predictable release workflows and isolated environments.</p>
            </article>
            <article className="feature-card">
              <h3>Scale without friction</h3>
              <p>Deliver stable performance across docs, API, and product surfaces with one architecture.</p>
            </article>
            <article className="feature-card">
              <h3>Secure by default</h3>
              <p>Security, observability, and legal-readiness built into the platform foundation.</p>
            </article>
          </section>
          <article className="mdx card reveal">{content}</article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
