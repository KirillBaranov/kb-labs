'use client';

import { useEffect, useRef, useState } from 'react';
import s from './DocsToc.module.css';

export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

export function DocsToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    const headingEls = items
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    observerRef.current?.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-60px 0px -60% 0px', threshold: 0 }
    );

    for (const el of headingEls) observerRef.current.observe(el);

    return () => observerRef.current?.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav className={s.toc} aria-label="On this page">
      <span className={s.title}>On this page</span>
      <ul className={s.list}>
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? s.itemL3 : ''}>
            <a
              href={`#${item.id}`}
              className={`${s.link}${activeId === item.id ? ` ${s.linkActive}` : ''}`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
