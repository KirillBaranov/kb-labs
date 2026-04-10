import Link from 'next/link';

type UseCaseItem = {
  title: string;
  hook: string;
  situation: string;
  how: string;
  result: string;
  owner: string;
};

type UseCasesSectionProps = {
  title: string;
  description: string;
  items: UseCaseItem[];
  labels: {
    situation: string;
    how: string;
    result: string;
    owner: string;
  };
  ctaLabel: string;
  ctaHref: string;
};

export function UseCasesSection({ title, description, items, ctaLabel, ctaHref }: UseCasesSectionProps) {
  return (
    <section className="ucs-section">
      <div className="ucs-head reveal">
        <div>
          <h2 className="ucs-title">{title}</h2>
          <p className="ucs-desc">{description}</p>
        </div>
        <Link className="ucs-cta" href={ctaHref}>
          {ctaLabel}
        </Link>
      </div>
      <div className="ucs-strip">
        {items.map((item, index) => (
          <Link key={item.title} className="ucs-row reveal" href={ctaHref} data-reveal-delay={String(index * 40)}>
            <span className="ucs-row-num">0{index + 1}</span>
            <div className="ucs-row-body">
              <span className="ucs-row-title">{item.title}</span>
              <span className="ucs-row-hook">{item.hook}</span>
            </div>
            <span className="ucs-row-arrow" aria-hidden>→</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
