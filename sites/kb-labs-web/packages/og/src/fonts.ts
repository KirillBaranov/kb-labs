/**
 * Fetches a TTF font binary for use with `next/og` (satori).
 *
 * Source: Fontsource on jsDelivr — https://cdn.jsdelivr.net/fontsource/fonts/<family>@latest/<subset>-<weight>-<style>.ttf
 *
 * Why not Google Fonts directly?
 *   `fonts.googleapis.com` now serves only `woff` / `woff2`, neither of which
 *   satori can parse. Fontsource publishes raw `.ttf` files via jsDelivr, which
 *   are exactly what satori expects.
 *
 * Result is cached in-process so the same font is only fetched once per cold start.
 */

const fontCache = new Map<string, Promise<ArrayBuffer>>();

interface FontRequest {
  /** Family name in fontsource slug form, e.g. "inter", "plus-jakarta-sans". */
  family: string;
  /** Numeric weight, e.g. 400, 500, 800. */
  weight: number;
  /** Subset, defaults to "latin". */
  subset?: string;
  /** "normal" or "italic", defaults to "normal". */
  style?: 'normal' | 'italic';
}

export async function loadFont(req: FontRequest): Promise<ArrayBuffer> {
  const subset = req.subset ?? 'latin';
  const style = req.style ?? 'normal';
  const key = `${req.family}@${req.weight}-${style}-${subset}`;

  const cached = fontCache.get(key);
  if (cached) return cached;

  const url = `https://cdn.jsdelivr.net/fontsource/fonts/${req.family}@latest/${subset}-${req.weight}-${style}.ttf`;

  const promise = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch font ${key} from ${url}: ${res.status}`);
    }
    return await res.arrayBuffer();
  })();

  fontCache.set(key, promise);
  return promise;
}
