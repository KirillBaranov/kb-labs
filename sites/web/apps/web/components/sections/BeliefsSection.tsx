import Link from 'next/link';

type BeliefRow = {
  id: string;
  belief: string;
  answer: string;
  answerLead: string;
  linkLabel: string;
  linkHref: string;
};

type BeliefsSectionProps = {
  title: string;
  lead: string;
  rows: BeliefRow[];
};

export function BeliefsSection({ title, lead, rows }: BeliefsSectionProps) {
  return (
    <section className="bf-section">
      <div className="bf-head reveal">
        <h2 className="bf-title">{title}</h2>
        <p className="bf-lead">{lead}</p>
      </div>
      <div className="bf-rows">
        {rows.map((row, index) => (
          <div
            key={row.id}
            className="bf-row reveal"
            data-reveal-delay={String(index * 80)}
          >
            <div className="bf-row-belief">
              <span className="bf-row-label">We believe</span>
              <p className="bf-row-text">{row.belief}</p>
            </div>
            <div className="bf-row-answer">
              <span className="bf-row-label">We built</span>
              <h3 className="bf-row-answer-title">{row.answer}</h3>
              <p className="bf-row-answer-lead">{row.answerLead}</p>
              <Link className="bf-row-link" href={row.linkHref}>
                {row.linkLabel}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
