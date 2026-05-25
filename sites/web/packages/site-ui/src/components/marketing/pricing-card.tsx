import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

export interface PricingCardProps {
  name: string;
  price: string;
  note?: string;
  badge?: string;
  features: string[];
  cta: string;
  href?: string;
  featured?: boolean;
  className?: string;
}

export function PricingCard({ name, price, note, badge, features, cta, href, featured = false, className }: PricingCardProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border bg-surface p-6 gap-5',
        featured ? 'border-accent shadow-card-lg' : 'border-line-strong shadow-card',
        className
      )}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="accent">{badge}</Badge>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold uppercase tracking-[0.09em] text-muted">{name}</span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-[2.4rem] font-bold tracking-tight text-kb-text leading-none">{price}</span>
        </div>
        {note && <p className="m-0 mt-1.5 text-sm text-muted">{note}</p>}
      </div>

      {href ? (
        <Button variant={featured ? 'primary' : 'secondary'} href={href} className="w-full justify-center">
          {cta}
        </Button>
      ) : (
        <Button variant={featured ? 'primary' : 'secondary'} className="w-full justify-center">
          {cta}
        </Button>
      )}

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-kb-text">
            <Check className="mt-0.5 size-4 shrink-0 text-accent" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
