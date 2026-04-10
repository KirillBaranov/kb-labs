import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';

// ─── Types ─────────────────────────────────────────────────────────

export interface UseInfiniteDataOptions<T, TCursor = string> {
  /** Extract the next-page cursor from the last fetched page. Return undefined to signal "no more pages". */
  getNextCursor: (lastPage: T) => TCursor | undefined;
  /** Additional query params (merged with cursor on each request) */
  params?: Record<string, string | number | boolean>;
  /** Enable/disable the query (default: true) */
  enabled?: boolean;
  /** Stale time override in ms */
  staleTime?: number;
  /** Query param name used to pass the cursor (default: 'cursor') */
  cursorParam?: string;
  /** Initial cursor value (default: undefined → first page) */
  initialCursor?: TCursor;
}

export interface UseInfiniteDataReturn<T> {
  /** All fetched pages */
  pages: T[];
  /** Flattened data from all pages (requires pages to be arrays) */
  data: T extends Array<infer U> ? U[] : T[];
  /** Loading first page */
  isLoading: boolean;
  /** Fetching any page (initial or next) */
  isFetching: boolean;
  /** Currently fetching next page */
  isFetchingNextPage: boolean;
  /** Whether more pages are available */
  hasNextPage: boolean;
  /** Fetch the next page */
  fetchNextPage: () => Promise<unknown>;
  /** Error if any */
  error: Error | null;
  isError: boolean;
  /** Refetch all pages */
  refetch: () => Promise<unknown>;
}

// ─── Hook ──────────────────────────────────────────────────────────

/**
 * Infinite/cursor-based pagination hook wrapping TanStack useInfiniteQuery.
 *
 * Works with any cursor-based or offset-based REST endpoint.
 *
 * @example
 * ```tsx
 * // Cursor-based pagination
 * const { data, fetchNextPage, hasNextPage } = useInfiniteData<RunsPage>(
 *   '/workflows/runs',
 *   {
 *     getNextCursor: (page) => page.nextCursor,
 *     params: { status: 'running' },
 *   },
 * );
 *
 * // Offset-based pagination
 * const { data, fetchNextPage } = useInfiniteData<LogEntry[]>(
 *   '/logs',
 *   {
 *     cursorParam: 'offset',
 *     getNextCursor: (page) => page.length === 50 ? String(allLogs.length) : undefined,
 *   },
 * );
 * ```
 */
export function useInfiniteData<T = unknown, TCursor = string>(
  endpoint: string,
  options: UseInfiniteDataOptions<T, TCursor>,
): UseInfiniteDataReturn<T> {
  const {
    getNextCursor,
    params,
    enabled,
    staleTime,
    cursorParam = 'cursor',
    initialCursor,
  } = options;

  const query = useInfiniteQuery<T, Error, InfiniteData<T, TCursor>, unknown[], TCursor>({
    queryKey: ['studio-infinite', endpoint, params],
    queryFn: async ({ pageParam }) => {
      const url = buildInfiniteUrl(endpoint, params, cursorParam, pageParam);
      return fetchPage<T>(url);
    },
    initialPageParam: initialCursor as TCursor,
    getNextPageParam: getNextCursor,
    enabled,
    staleTime,
  });

  const pages = query.data?.pages ?? [];
  const flatData = pages.flatMap((page) => (Array.isArray(page) ? page : [page]));

  return {
    pages,
    data: flatData as UseInfiniteDataReturn<T>['data'],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    isError: query.isError,
    refetch: query.refetch,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

function buildInfiniteUrl<TCursor>(
  endpoint: string,
  params: Record<string, string | number | boolean> | undefined,
  cursorParam: string,
  cursor: TCursor | undefined,
): string {
  const sp = new URLSearchParams();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        sp.set(key, String(value));
      }
    }
  }

  if (cursor !== undefined && cursor !== null) {
    sp.set(cursorParam, String(cursor));
  }

  const qs = sp.toString();
  const base = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
  return qs ? `${base}?${qs}` : base;
}

async function fetchPage<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as Record<string, unknown>;
  // Unwrap platform envelope { ok, data, meta }
  if (json && typeof json === 'object' && 'ok' in json && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}
