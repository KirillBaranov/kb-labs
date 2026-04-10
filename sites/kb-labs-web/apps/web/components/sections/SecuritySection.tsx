type SecurityFeature = {
  label: string;
  description: string;
};

type SecuritySectionProps = {
  title: string;
  description: string;
  ctaLabel: string;
  features: SecurityFeature[];
};

export function SecuritySection({ title, description, ctaLabel, features }: SecuritySectionProps) {
  return (
    <section className="sec-section">
      <div className="sec-left reveal">
        <h2 className="sec-title">{title}</h2>
        <p className="sec-desc">{description}</p>
        <a className="sec-cta" href="https://docs.kblabs.ru/operations/security">
          {ctaLabel}
        </a>
      </div>
      <div className="sec-features">
        {features.map((f, index) => (
          <div
            key={f.label}
            className="sec-feature reveal"
            data-reveal-delay={String(index * 60)}
          >
            <span className="sec-feature-dot" />
            <div>
              <span className="sec-feature-label">{f.label}</span>
              <span className="sec-feature-desc">{f.description}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
