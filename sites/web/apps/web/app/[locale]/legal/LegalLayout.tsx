import Link from 'next/link';

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
    <div className="mx-auto flex max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:px-8 lg:flex-row flex-col">
      {/* Sidebar */}
      <nav className="lg:w-48 shrink-0 flex flex-col gap-1">
        <span className="mb-2 px-3 text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50">Legal</span>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
              item.href === currentHref
                ? 'bg-surface text-kb-text font-medium'
                : 'text-muted/70 hover:bg-surface/60 hover:text-kb-text'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Document */}
      <article className="min-w-0 flex-1">
        <header className="mb-8 border-b border-line pb-6">
          <h1 className="text-2xl font-bold tracking-tight text-kb-text sm:text-3xl">{title}</h1>
          <span className="mt-2 block text-sm text-muted/50">Last updated: {updated}</span>
        </header>
        <div className="prose prose-invert max-w-none">
          {children}
        </div>
      </article>
    </div>
  );
}
