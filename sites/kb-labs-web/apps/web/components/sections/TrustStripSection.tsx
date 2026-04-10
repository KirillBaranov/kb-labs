type TrustStripSectionProps = {
  label: string;
  items: string[];
};

export function TrustStripSection({ label, items }: TrustStripSectionProps) {
  return (
    <section className="proof reveal">
      <span>{label}</span>
      <div className="proof-row">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </section>
  );
}

