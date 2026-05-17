import Image from 'next/image';
import Link from 'next/link';

type BeliefRow = {
  id: string;
  belief: string;
  answer: string;
  answerLead: string;
  linkLabel: string;
  linkHref: string;
  screenshot?: string;
  screenshotAlt?: string;
};

type BeliefsSectionProps = {
  title: string;
  lead: string;
  rows: BeliefRow[];
};

const SCREENSHOTS: Record<string, { src: string; alt: string }> = {
  routine: {
    src: '/screenshots/workflow-in-progress.png',
    alt: 'KB Labs Studio — workflow running step by step in real time',
  },
  openness: {
    src: '/screenshots/marketplace-ui.png',
    alt: 'KB Labs Marketplace — installed plugins and adapters',
  },
  ownership: {
    src: '/screenshots/settings-configuration-displaying.png',
    alt: 'KB Labs Settings — platform adapters configured in one place',
  },
};

export function BeliefsSection({ title, lead, rows }: BeliefsSectionProps) {
  return (
    <section className="bf-section">
      <div className="bf-head reveal">
        <h2 className="bf-title">{title}</h2>
        <p className="bf-lead">{lead}</p>
      </div>
      <div className="bf-rows">
        {rows.map((row, index) => {
          const screenshot = SCREENSHOTS[row.id];
          return (
            <div
              key={row.id}
              className="bf-row reveal"
              data-reveal-delay={String(index * 80)}
            >
              <div className="bf-row-belief">
                <span className="bf-row-label">The problem</span>
                <p className="bf-row-text">{row.belief}</p>
              </div>
              <div className="bf-row-answer">
                <span className="bf-row-label">The answer</span>
                <h3 className="bf-row-answer-title">{row.answer}</h3>
                <p className="bf-row-answer-lead">{row.answerLead}</p>
                <Link className="bf-row-link" href={row.linkHref}>
                  {row.linkLabel}
                </Link>
                {screenshot && (
                  <div className="bf-row-screenshot">
                    <Image
                      src={screenshot.src}
                      alt={screenshot.alt}
                      width={720}
                      height={440}
                      className="bf-row-screenshot-img"
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
