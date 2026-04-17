import Link from 'next/link';

type HeroSectionProps = {
  title: string;
  description: string;
  body?: string;
  cta1: string;
  cta2: string;
  cta1Href: string;
  cta2Href: string;
};

export function HeroSection({ title, description, body, cta1, cta2, cta1Href, cta2Href }: HeroSectionProps) {
  return (
    <section className="hero-screen reveal home">
      {/* Grid overlay */}
      <div className="hero-grid" aria-hidden="true">
        <span className="hero-grid-cross" style={{ top: 0, left: 0 }} />
        <span className="hero-grid-cross" style={{ top: 0, right: 0 }} />
        <span className="hero-grid-cross" style={{ bottom: 0, left: 0 }} />
        <span className="hero-grid-cross" style={{ bottom: 0, right: 0 }} />
      </div>

      {/* Radial glow graphic */}
      <div className="hero-graphic" aria-hidden="true">
        <svg className="hero-rings" viewBox="0 0 800 400" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 22 }, (_, i) => {
            const r = 60 + i * 28;
            const hue = 200 + i * 8;
            return (
              <ellipse
                key={i}
                cx="400" cy="400"
                rx={r * 1.9} ry={r}
                stroke={`hsl(${hue}, 70%, 58%)`}
                strokeWidth="0.8"
                opacity={0.35 - i * 0.01}
              />
            );
          })}
        </svg>
      </div>

      <div className="hero-main">
        <h1 className="title">{title}</h1>
        <p className="subtitle">{description}</p>
        {body && <p className="hero-body">{body}</p>}
        <div className="cta-row">
          <Link className="btn primary" href={cta1Href} data-analytics="install_cta">
            {cta1}
          </Link>
          <Link className="btn secondary" href={cta2Href} data-analytics="docs_cta" target="_blank" rel="noopener noreferrer">
            {cta2}
          </Link>
        </div>
      </div>
    </section>
  );
}
