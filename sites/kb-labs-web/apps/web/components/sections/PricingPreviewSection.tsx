type PricingTier = {
  name: string;
  price: string;
  note: string;
  cta: string;
  href: string;
  featured?: boolean;
};

type PricingPreviewSectionProps = {
  title: string;
  description: string;
  tiers: PricingTier[];
};

export function PricingPreviewSection({ title, description, tiers }: PricingPreviewSectionProps) {
  return (
    <section className="pricing-block reveal">
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="pricing-tiers">
        {tiers.map((tier) => {
          const isExternal = /^https?:\/\//.test(tier.href);
          return (
            <div key={tier.name} className={`pricing-tier${tier.featured ? ' featured' : ''}`}>
            <div className="pricing-tier-top">
              <span className="pricing-tier-name">{tier.name}</span>
              <span className="pricing-tier-price">{tier.price}</span>
            </div>
            <p className="pricing-tier-note">{tier.note}</p>
            <a
              className="pricing-tier-cta"
              href={tier.href}
              {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {tier.cta}
            </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}
