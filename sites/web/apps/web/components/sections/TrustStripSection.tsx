import Link from 'next/link';

type SecurityMarker = {
  label: string;
  href: string;
};

type TrustStripSectionProps = {
  label: string;
  items: string[];
  securityMarkers?: SecurityMarker[];
};

export function TrustStripSection({ label, items, securityMarkers }: TrustStripSectionProps) {
  return (
    <section className="proof reveal">
      <span>{label}</span>
      <div className="proof-row">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {securityMarkers && securityMarkers.length > 0 && (
        <div className="proof-security">
          {securityMarkers.map((marker, index) => (
            <span key={marker.label}>
              {index > 0 && <span className="proof-security-sep">·</span>}
              <Link href={marker.href} className="proof-security-link">
                {marker.label}
              </Link>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

