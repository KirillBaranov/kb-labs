'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavGroup } from '@/nav.config';
import s from './DocsSidebar.module.css';

type DocsSidebarProps = {
  nav: NavGroup[];
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`${s.chevron}${open ? ` ${s.chevronOpen}` : ''}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 6.5L8 9l2.5-2.5" />
    </svg>
  );
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  const isActiveGroup = group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
  const [open, setOpen] = useState(isActiveGroup);

  // Keep open state in sync when navigating
  useEffect(() => {
    if (isActiveGroup) setOpen(true);
  }, [isActiveGroup]);

  return (
    <div className={s.group}>
      <button
        className={s.groupTitle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {group.title}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <ul className={s.groupItems}>
          {group.items.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${s.item}${active ? ` ${s.itemActive}` : ''}`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DocsSidebar({ nav }: DocsSidebarProps) {
  const pathname = usePathname();

  // Separate "Start Here" (top-level flat items) from collapsible groups
  const [startHere, ...groups] = nav;

  return (
    <nav className={s.sidebar} aria-label="Documentation navigation">
      {/* Top-level items (Quick Start, Installation) — always visible */}
      {startHere && (
        <div className={s.topItems}>
          {startHere.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${s.item}${active ? ` ${s.itemActive}` : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className={s.divider} />

      {/* Collapsible groups */}
      {groups.map((group) => (
        <NavGroupSection key={group.title} group={group} pathname={pathname} />
      ))}
    </nav>
  );
}
