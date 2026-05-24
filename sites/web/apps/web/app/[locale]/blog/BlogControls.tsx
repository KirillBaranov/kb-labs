'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

interface Props {
  allTags: string[];
  activeTag: string;
  query: string;
  labels: {
    searchPlaceholder: string;
    filterAll: string;
  };
}

export function BlogControls({ allTags, activeTag, query, labels }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const push = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v) params.set(k, v);
        else params.delete(k);
      });
      // Reset page on any filter change
      params.delete('page');
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Tag filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => push({ tag: '' })}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !activeTag
              ? 'border-accent bg-accent/10 text-accent ring-1 ring-inset ring-accent/20'
              : 'border-line text-muted/60 hover:border-accent/40 hover:text-kb-text'
          }`}
        >
          {labels.filterAll}
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => push({ tag })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeTag === tag
                ? 'border-accent bg-accent/10 text-accent ring-1 ring-inset ring-accent/20'
                : 'border-line text-muted/60 hover:border-accent/40 hover:text-kb-text'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="search"
        defaultValue={query}
        onChange={(e) => push({ q: e.target.value })}
        placeholder={labels.searchPlaceholder}
        className="w-full rounded-xl border border-line bg-surface px-4 py-2 text-sm text-kb-text placeholder:text-muted/40 focus:border-accent/50 focus:outline-none sm:w-56"
      />
    </div>
  );
}
