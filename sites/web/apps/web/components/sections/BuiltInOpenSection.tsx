import Link from 'next/link';

type BuiltInOpenDoor = {
  id: string;
  label: string;
  description: string;
  href: string;
  external?: boolean;
};

type BuiltInOpenSectionProps = {
  title: string;
  lead: string;
  doors: BuiltInOpenDoor[];
};

export function BuiltInOpenSection({ title, lead, doors }: BuiltInOpenSectionProps) {
  return (
    <section className="bio-section">
      <div className="bio-head reveal">
        <h2 className="bio-title">{title}</h2>
        <p className="bio-lead">{lead}</p>
      </div>
      <div className="bio-doors">
        {doors.map((door, index) => {
          const content = (
            <>
              <span className="bio-door-label">{door.label}</span>
              <p className="bio-door-desc">{door.description}</p>
            </>
          );
          if (door.external) {
            return (
              <a
                key={door.id}
                className="bio-door reveal"
                href={door.href}
                target="_blank"
                rel="noopener noreferrer"
                data-reveal-delay={String(index * 80)}
              >
                {content}
              </a>
            );
          }
          return (
            <Link
              key={door.id}
              className="bio-door reveal"
              href={door.href}
              data-reveal-delay={String(index * 80)}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
