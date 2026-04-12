import Link from 'next/link';

type WorkflowStep = {
  title: string;
  description: string;
};

type WorkflowSectionProps = {
  title: string;
  lead: string;
  sideText: string;
  kpis: string[];
  ctaLabel: string;
  ctaHref: string;
  steps: WorkflowStep[];
};

export function WorkflowSection({ title, lead, ctaLabel, ctaHref, steps }: WorkflowSectionProps) {
  return (
    <section className="wf-section">
      <div className="wf-head reveal">
        <div className="wf-head-left">
          <h2 className="wf-title">{title}</h2>
          <p className="wf-lead">{lead}</p>
        </div>
        <Link className="wf-cta" href={ctaHref}>
          {ctaLabel}
        </Link>
      </div>
      <div className="wf-steps">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className="wf-step reveal"
            data-reveal-delay={String(index * 80)}
          >
            <span className="wf-step-num">0{index + 1}</span>
            <div className="wf-step-body">
              <h3 className="wf-step-title">{step.title.replace(/^\d+\s*/, '')}</h3>
              <p className="wf-step-desc">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
