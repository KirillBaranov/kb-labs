'use client';

import Link from 'next/link';
import { useState } from 'react';

import { WorkflowRunCard } from '../graphics/WorkflowRunCard';

type Audience = {
  id: string;
  tab: string;
  headline: string;
  subtext: string;
  bullets: string[];
};

type ValuePropsSectionProps = {
  audiences: Audience[];
  ctaLabel: string;
  ctaHref: string;
};

export function ValuePropsSection({ audiences, ctaLabel, ctaHref }: ValuePropsSectionProps) {
  const [activeId, setActiveId] = useState(audiences[0]?.id ?? '');
  const active = audiences.find((a) => a.id === activeId) ?? audiences[0];

  return (
    <section className="vp-section">
      {/* Tab pills */}
      <div className="vp-tabs" role="tablist">
        {audiences.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={a.id === activeId}
            className={`vp-tab${a.id === activeId ? ' vp-tab--active' : ''}`}
            onClick={() => setActiveId(a.id)}
          >
            {a.tab}
          </button>
        ))}
      </div>

      {/* Body: text left, pipeline right */}
      <div className="vp-body reveal">
        <div className="vp-text" key={activeId}>
          <h2 className="vp-headline">{active.headline}</h2>
          <p className="vp-subtext">{active.subtext}</p>
          <ul className="vp-bullets">
            {active.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <Link href={ctaHref} className="vp-cta">
            {ctaLabel} →
          </Link>
        </div>

        <div className="vp-visual">
          <WorkflowRunCard />
        </div>
      </div>
    </section>
  );
}
