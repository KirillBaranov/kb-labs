import { useQuery, useMutation, type UseQueryOptions, type MutateOptions } from '@tanstack/react-query';

// ─── useData ────────────────────────────────────────────────────────

export interface UseDataOptions<T> {
  /** Polling interval in ms (0 = no polling) */
  pollingMs?: number;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Stale time override in ms */
  staleTime?: number;
  /** Transform response before returning */
  select?: (data: unknown) => T;
  /** Additional query params appended to endpoint */
  params?: Record<string, string | number | boolean>;
}

export interface UseDataReturn<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  isFetching: boolean;
}

/**
 * Data fetching hook wrapping TanStack Query.
 * Fetches from the platform REST API (same origin).
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useData<Commit[]>('/v1/plugins/commit/history');
 * const { data: filtered } = useData('/v1/plugins/commit/files', { params: { scope } });
 * ```
 */
export function useData<T = unknown>(
  endpoint: string,
  options?: UseDataOptions<T>,
): UseDataReturn<T> {
  const url = buildUrl(endpoint, options?.params);

  const query = useQuery<unknown, Error, T>({
    queryKey: ['studio-data', url],
    queryFn: () => fetchJson(url),
    enabled: options?.enabled,
    staleTime: options?.staleTime,
    refetchInterval: options?.pollingMs || undefined,
    select: options?.select as UseQueryOptions<unknown, Error, T>['select'],
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}

// ─── useMutateData ──────────────────────────────────────────────────

export interface UseMutateDataReturn<TInput, TOutput> {
  mutate: (input: TInput, options?: MutateOptions<TOutput, Error, TInput>) => void;
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  data: TOutput | undefined;
}

/**
 * Mutation hook for POST/PUT/PATCH/DELETE.
 *
 * @example
 * ```tsx
 * const { mutateAsync } = useMutateData<CommitInput, CommitResult>('/v1/plugins/commit/create');
 * await mutateAsync({ scope, message });
 * ```
 */
export function useMutateData<TInput = unknown, TOutput = unknown>(
  endpoint: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
): UseMutateDataReturn<TInput, TOutput> {
  const mutation = useMutation<TOutput, Error, TInput>({
    mutationFn: async (input: TInput) => {
      const hasBody = input !== undefined && input !== null;
      const res = await fetch(`/api${endpoint}`, {
        method,
        headers: hasBody ? { 'Content-Type': 'application/json' } : {},
        body: hasBody ? JSON.stringify(input) : undefined,
      });
      if (!res.ok) {
        throw new Error(`${method} ${endpoint} failed: ${res.status} ${res.statusText}`);
      }
      return res.json() as Promise<TOutput>;
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isLoading: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
): string {
  if (!params || Object.keys(params).length === 0) { return endpoint; }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}${searchParams.toString()}`;
}

async function fetchJson(endpoint: string): Promise<unknown> {
  const res = await fetch(`/api${endpoint}`);
  if (!res.ok) {
    throw new Error(`GET ${endpoint} failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as Record<string, unknown>;
  // Unwrap platform envelope { ok, data, meta }
  if (json && typeof json === 'object' && 'ok' in json && 'data' in json) {
    return json.data;
  }
  return json;
}
