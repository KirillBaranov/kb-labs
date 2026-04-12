type FaqItem = {
  q: string;
  a: string;
};

type FaqSectionProps = {
  title: string;
  items: FaqItem[];
};

export function FaqSection({ title, items }: FaqSectionProps) {
  return (
    <section className="faq-block reveal">
      <h2 className="faq-title">{title}</h2>
      <div className="faq-rows">
        {items.map((item) => (
          <div key={item.q} className="faq-row">
            <p className="faq-q">{item.q}</p>
            <p className="faq-a">{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

