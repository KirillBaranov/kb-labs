import Link from 'next/link';
import styles from './legal.module.css';

type NavItem = { label: string; href: string };

type Props = {
  title: string;
  updated: string;
  lastUpdatedLabel: string;
  navTitle: string;
  navItems: NavItem[];
  currentHref: string;
  children: React.ReactNode;
};

export function LegalLayout({
  title,
  updated,
  lastUpdatedLabel,
  navTitle,
  navItems,
  currentHref,
  children,
}: Props) {
  return (
    <div className={styles.wrap}>
      {/* Sidebar */}
      <nav className={styles.sidebar}>
        <span className={styles.sidebarLabel}>{navTitle}</span>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.sidebarLink}${item.href === currentHref ? ` ${styles.active}` : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Document */}
      <article className={styles.doc}>
        <header className={styles.docHeader}>
          <h1>{title}</h1>
          <span className={styles.docMeta}>
            {lastUpdatedLabel} {updated}
          </span>
        </header>
        <div className={styles.prose}>{children}</div>
      </article>
    </div>
  );
}
