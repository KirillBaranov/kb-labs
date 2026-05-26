'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import s from './DocsLayout.module.css';

type Props = {
  sidebar: ReactNode;
  toc: ReactNode;
  children: ReactNode;
};

export function DocsBodyWrapper({ sidebar, toc, children }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close drawer on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* Mobile hamburger — fixed inside header area */}
      <button
        className={s.hamburger}
        onClick={toggle}
        aria-label="Navigation menu"
        aria-expanded={open}
      >
        <span className={`${s.bar} ${open ? s.barOpen1 : ''}`} />
        <span className={`${s.bar} ${open ? s.barOpen2 : ''}`} />
        <span className={`${s.bar} ${open ? s.barOpen3 : ''}`} />
      </button>

      <div className={s.body}>
        <aside className={`${s.sidebar} ${open ? s.sidebarOpen : ''}`}>
          {sidebar}
        </aside>

        <main className={s.content}>
          {children}
        </main>

        <aside className={s.toc}>
          {toc}
        </aside>
      </div>

      {/* Overlay — closes drawer when tapping outside */}
      {open && (
        <div
          className={s.overlay}
          onClick={close}
          aria-hidden="true"
        />
      )}
    </>
  );
}
