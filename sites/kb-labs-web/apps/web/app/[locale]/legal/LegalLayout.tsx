import Link from 'next/link';
import s from './legal.module.css';

const NAV = [
  { label: 'Privacy Policy', href: '/legal/privacy' },
  { label: 'Terms of Service', href: '/legal/terms' },
  { label: 'Data Processing', href: '/legal/dpa' },
  { label: 'Cookie Policy', href: '/legal/cookies' },
];

type Props = {
  title: string;
  updated: string;
  currentHref: string;
  children: React.ReactNode;
};

export function LegalLayout({ title, updated, currentHref, children }: Props) {
  return (
    <div className={s.wrap}>
      <nav className={s.sidebar}>
        <span className={s.sidebarLabel}>Legal</span>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${s.sidebarLink}${item.href === currentHref ? ` ${s.active}` : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <article className={s.doc}>
        <header className={s.docHeader}>
          <h1>{title}</h1>
          <span className={s.docMeta}>Last updated: {updated}</span>
        </header>
        <div className={s.prose}>
          {children}
        </div>
      </article>
    </div>
  );
}
