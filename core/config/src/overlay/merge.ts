/**
 * @module @kb-labs/core/config/overlay/merge
 *
 * Deep-merge an overlay onto a base config with overlay-specific semantics:
 *
 *   - plain objects: recursive merge
 *   - scalars: overlay wins
 *   - arrays: REPLACE by default (differs from `mergeDefined`, which concatenates)
 *   - directive `kb:merge` (sibling key inside an object): per-field strategy
 *     map switching arrays to append-mode.
 *
 * Example:
 *
 *   base    = { adapters: { llm: ['openai'] } }
 *   overlay = { adapters: { 'kb:merge': { llm: 'append' }, llm: ['vibeproxy'] } }
 *   result  = { adapters: { llm: ['openai', 'vibeproxy'] } }
 *
 * The `kb:merge` key is consumed and never appears in the result.
 *
 * Only the `append` strategy is supported in MVP; `prepend`, `unique`, `by-key`
 * are intentionally out of scope.
 */

export const OVERLAY_DIRECTIVE_KEY = 'kb:merge' as const;

export type OverlayArrayStrategy = 'append' | 'replace';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

function extractDirective(
  overlay: Record<string, unknown>,
): Record<string, OverlayArrayStrategy> {
  const raw = overlay[OVERLAY_DIRECTIVE_KEY];
  if (!isPlainObject(raw)) {
    return {};
  }
  const out: Record<string, OverlayArrayStrategy> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === 'append' || v === 'replace') {
      out[k] = v;
    } else {
      throw new Error(
        `Invalid kb:merge strategy for "${k}": ${JSON.stringify(v)}. Expected "append" or "replace".`,
      );
    }
  }
  return out;
}

/**
 * Deep-merge `overlay` onto `base` using overlay semantics.
 *
 * The function never mutates either argument. Arrays in the result are always
 * fresh instances; objects are spread copies.
 */
export function mergeOverlay<T>(base: T, overlay: unknown): T {
  // Both arrays: overlay replaces wholesale (override semantics).
  // Append is opt-in via a parent-object directive, so a raw array vs array
  // collision at the top level (or anywhere without a parent directive) is
  // always replace.
  if (Array.isArray(base) && Array.isArray(overlay)) {
    return [...overlay] as unknown as T;
  }

  // Both plain objects: recursive merge with directive parsing.
  if (isPlainObject(base) && isPlainObject(overlay)) {
    const directives = extractDirective(overlay);
    const result: Record<string, unknown> = { ...base };

    for (const [key, overlayValue] of Object.entries(overlay)) {
      if (key === OVERLAY_DIRECTIVE_KEY) {
        continue;
      }
      const baseValue = result[key];
      const strategy = directives[key];

      if (Array.isArray(baseValue) && Array.isArray(overlayValue)) {
        result[key] =
          strategy === 'append'
            ? [...baseValue, ...overlayValue]
            : [...overlayValue];
      } else if (isPlainObject(baseValue) && isPlainObject(overlayValue)) {
        result[key] = mergeOverlay(baseValue, overlayValue);
      } else {
        result[key] = overlayValue;
      }
    }

    return result as T;
  }

  // Type mismatch or scalar: overlay wins.
  return overlay as T;
}
