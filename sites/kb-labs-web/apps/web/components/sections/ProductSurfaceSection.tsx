type ProductSurfaceSectionProps = {
  title: string;
  description: string;
};

export function ProductSurfaceSection({ title, description }: ProductSurfaceSectionProps) {
  return (
    <section className="section-card reveal">
      <h2>{title}</h2>
      <p className="section-note">{description}</p>
      <div className="surface-grid">
        <div className="surface-card">Web Surface Placeholder</div>
        <div className="surface-card">Docs Surface Placeholder</div>
        <div className="surface-card">App Surface Placeholder</div>
      </div>
    </section>
  );
}
