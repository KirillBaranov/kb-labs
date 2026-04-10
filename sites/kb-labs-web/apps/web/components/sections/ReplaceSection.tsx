type ReplaceRow = {
  before: string;
  after: string;
};

type ReplaceSectionProps = {
  title: string;
  beforeLabel: string;
  afterLabel: string;
  note: string;
  rows: ReplaceRow[];
};

export function ReplaceSection({ title, beforeLabel, afterLabel, note, rows }: ReplaceSectionProps) {
  return (
    <section className="replace-section reveal">
      <h2 className="replace-title">{title}</h2>
      <div className="replace-table">
        <div className="replace-thead">
          <span className="replace-thead-before">{beforeLabel}</span>
          <span className="replace-thead-after">{afterLabel}</span>
        </div>
        {rows.map((row) => (
          <div key={row.before} className="replace-row">
            <span className="replace-row-before">{row.before}</span>
            <span className="replace-row-after">{row.after}</span>
          </div>
        ))}
      </div>
      <p className="replace-note">{note}</p>
    </section>
  );
}
