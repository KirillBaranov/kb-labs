/**
 * @module @kb-labs/gateway-auth/tenant-resolver
 *
 * Map `Host`-header → `tenantId` (ADR-0020, Phase 1.9).
 *
 * Pattern is configurable (`{tenant}.kblabs.ru` in cloud) so the same
 * resolver can be used in dev (`{tenant}.localhost`) or for on-prem
 * customers (`{tenant}.acme.example.com`).
 *
 * Returns `null` instead of throwing on bad/reserved hosts — the
 * middleware then renders the right 4xx and avoids surfacing an
 * internal error. Slug rules are strict (`[a-z0-9-]{2,40}`, no
 * leading/trailing dash) so a stray "weird" subdomain doesn't become a
 * valid tenant by accident.
 */

// 2..40 chars; first and last must be alnum; middle can include hyphens.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'api',
  'www',
  'docs',
  'studio',
  'mail',
  'admin',
  'static',
  'cdn',
]);

export interface TenantResolverOptions {
  /** Host pattern containing exactly one `{tenant}` placeholder. */
  pattern: string;
  /** Optional override of the reserved set (must remain a superset of the default in production). */
  reserved?: ReadonlySet<string>;
}

export interface TenantResolver {
  resolve(host: string | undefined): string | null;
}

/**
 * Compile the `{tenant}.example.com` pattern into a regex.
 *
 * Apex placeholder is escaped (so `.` matches a literal `.`), and the
 * `{tenant}` placeholder is replaced by a non-greedy match that the
 * outer code then validates against `SLUG_RE`.
 */
const compilePattern = (pattern: string): RegExp => {
  const escapedTail = pattern
    .replace('{tenant}.', '')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^([^.]+)\\.${escapedTail}$`);
};

export const createTenantResolver = (opts: TenantResolverOptions): TenantResolver => {
  const re = compilePattern(opts.pattern);
  const reserved = opts.reserved ?? RESERVED_SUBDOMAINS;
  const cache = new Map<string, string | null>();
  const CACHE_LIMIT = 100;

  return {
    resolve(host: string | undefined): string | null {
      if (!host) {return null;}
      const normalised = host.toLowerCase().split(':')[0] ?? '';
      if (!normalised) {return null;}
      if (cache.has(normalised)) {return cache.get(normalised)!;}

      let result: string | null = null;
      const m = normalised.match(re);
      if (m) {
        const candidate = m[1]!;
        if (SLUG_RE.test(candidate) && !reserved.has(candidate)) {
          result = candidate;
        }
      }

      if (cache.size >= CACHE_LIMIT) {
        // Crude LRU — drop the oldest insert.
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {cache.delete(firstKey);}
      }
      cache.set(normalised, result);
      return result;
    },
  };
};
