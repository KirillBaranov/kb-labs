'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export type AnimationType = 'fade' | 'slide-up' | 'slide-left' | 'scale';

export interface AnimateOnScrollProps {
  children: React.ReactNode;
  className?: string;
  animation?: AnimationType;
  delay?: number;
  threshold?: number;
}

export function AnimateOnScroll({
  children,
  className,
  animation = 'fade',
  delay = 0,
  threshold = 0.1,
}: AnimateOnScrollProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={cn(className)}
      data-animate={animation}
      data-visible={visible ? '' : undefined}
      // CSS custom property — sets the delay variable read by data-animate CSS rules
      {...(delay > 0 ? { style: { '--anim-delay': `${delay}ms` } as React.CSSProperties } : {})}
    >
      {children}
    </div>
  );
}
