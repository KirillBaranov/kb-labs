import Link from 'next/link';

type StartBesideStep = {
  num: string;
  title: string;
  description: string;
};

type StartBesideSectionProps = {
  title: string;
  lead: string;
  steps: StartBesideStep[];
  note: string;
  cta: string;
  ctaHref: string;
};

export function StartBesideSection({
  title,
  lead,
  steps,
  note,
  cta,
  ctaHref,
}: StartBesideSectionProps) {
  return (
    <section className="sb-section">
      <div className="sb-head reveal">
        <h2 className="sb-title">{title}</h2>
        <p className="sb-lead">{lead}</p>
      </div>
      <div className="sb-steps">
        {steps.map((step, index) => (
          <div
            key={step.num}
            className="sb-step reveal"
            data-reveal-delay={String(index * 80)}
          >
            <span className="sb-step-num">{step.num}</span>
            <h3 className="sb-step-title">{step.title}</h3>
            <p className="sb-step-desc">{step.description}</p>
          </div>
        ))}
      </div>
      <div className="sb-footer reveal">
        <p className="sb-note">{note}</p>
        <Link className="sb-cta" href={ctaHref}>
          {cta}
        </Link>
      </div>
    </section>
  );
}
