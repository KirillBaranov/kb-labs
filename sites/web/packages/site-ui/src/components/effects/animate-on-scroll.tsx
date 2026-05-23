'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

export interface AnimateOnScrollProps {
  children: React.ReactNode;
  className?: string;
  animation?: 'fade' | 'slide-up' | 'slide-left' | 'scale';
  delay?: number;
  threshold?: number;
}

type AnimConfig = {
  initial: React.CSSProperties;
  active: React.CSSProperties;
};

const animations: Record<string, AnimConfig> = {
  fade: {
    initial: { opacity: 0 },
    active: { opacity: 1 },
  },
  'slide-up': {
    initial: { opacity: 0, transform: 'translateY(24px)' },
    active: { opacity: 1, transform: 'translateY(0)' },
  },
  'slide-left': {
    initial: { opacity: 0, transform: 'translateX(24px)' },
    active: { opacity: 1, transform: 'translateX(0)' },
  },
  scale: {
    initial: { opacity: 0, transform: 'scale(0.95)' },
    active: { opacity: 1, transform: 'scale(1)' },
  },
};

export function AnimateOnScroll({
  children,
  className,
  animation = 'fade',
  delay = 0,
  threshold = 0.1,
}: AnimateOnScrollProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);
  const config = animations[animation];

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

  const style: React.CSSProperties = {
    ...(visible ? config.active : config.initial),
    transition: `all 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
  };

  return (
    <div ref={ref} className={cn(className)} style={style}>
      {children}
    </div>
  );
}
