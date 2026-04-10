import Link from 'next/link';

type FinalCtaSectionProps = {
  title: string;
  description: string;
  cta1: string;
  cta2: string;
  cta3: string;
  cta1Href: string;
  cta2Href: string;
};

export function FinalCtaSection({ title, description, cta1, cta2, cta3, cta1Href, cta2Href }: FinalCtaSectionProps) {
  return (
    <section className="fcta-section">
      <h2 className="fcta-title reveal">{title}</h2>
      <p className="fcta-desc reveal" data-reveal-delay="80">{description}</p>
      <div className="fcta-actions reveal" data-reveal-delay="160">
        <Link className="btn primary" href={cta1Href}>
          {cta1}
        </Link>
        <Link className="btn secondary" href={cta2Href}>
          {cta2}
        </Link>
        <a className="btn secondary" href="https://docs.kblabs.ru">
          {cta3}
        </a>
      </div>
    </section>
  );
}
