type SolutionItem = {
  title: string;
  description: string;
};

type SolutionsSectionProps = {
  title: string;
  items: SolutionItem[];
};

export function SolutionsSection({ title, items }: SolutionsSectionProps) {
  return (
    <section className="sol-section">
      <h2 className="sol-title reveal">{title}</h2>
      <div className="sol-grid">
        {items.map((item, index) => (
          <article
            key={item.title}
            className="sol-card reveal"
            data-reveal-delay={String(index * 80)}
          >
            <span className="sol-num">0{index + 1}</span>
            <h3 className="sol-card-title">{item.title}</h3>
            <p className="sol-card-desc">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
