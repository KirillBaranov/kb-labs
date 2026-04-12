type SameRailsPoint = {
  title: string;
  description: string;
};

type SameRailsSectionProps = {
  title: string;
  lead: string;
  points: SameRailsPoint[];
  caption: string;
};

export function SameRailsSection({ title, lead, points, caption }: SameRailsSectionProps) {
  return (
    <section className="sr-section">
      <div className="sr-head reveal">
        <h2 className="sr-title">{title}</h2>
        <p className="sr-lead">{lead}</p>
      </div>
      <div className="sr-points">
        {points.map((point, index) => (
          <div
            key={point.title}
            className="sr-point reveal"
            data-reveal-delay={String(index * 80)}
          >
            <h3 className="sr-point-title">{point.title}</h3>
            <p className="sr-point-desc">{point.description}</p>
          </div>
        ))}
      </div>
      <p className="sr-caption reveal">{caption}</p>
    </section>
  );
}
