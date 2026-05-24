'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

interface Props {
  page: number;
  totalPages: number;
  labels: { prevPage: string; nextPage: string };
}

export function BlogPagination({ page, totalPages, labels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const goTo = (n: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (n === 1) params.delete('page');
    else params.set('page', String(n));
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: true });
    });
  };

  if (totalPages <= 1) return null;

  return (
    <div className="mt-10 flex items-center justify-center gap-3">
      <button
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
        className="rounded-xl border border-line px-4 py-2 text-sm text-muted/60 transition-colors hover:border-accent/40 hover:text-kb-text disabled:pointer-events-none disabled:opacity-30"
      >
        {labels.prevPage}
      </button>

      <div className="flex gap-1.5">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => goTo(n)}
            className={`size-8 rounded-lg text-sm font-medium transition-colors ${
              n === page
                ? 'bg-accent/10 text-accent ring-1 ring-inset ring-accent/20'
                : 'text-muted/50 hover:text-kb-text'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <button
        disabled={page >= totalPages}
        onClick={() => goTo(page + 1)}
        className="rounded-xl border border-line px-4 py-2 text-sm text-muted/60 transition-colors hover:border-accent/40 hover:text-kb-text disabled:pointer-events-none disabled:opacity-30"
      >
        {labels.nextPage}
      </button>
    </div>
  );
}
