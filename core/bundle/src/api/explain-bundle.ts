/**
 * @module @kb-labs/core-bundle/api/explain-bundle
 * Bundle explanation logic
 */

import type { MergeTrace } from '@kb-labs/core-config';
import { loadBundle } from './load-bundle';
import type { ExplainBundleOptions } from '../types/types';

/**
 * Explain bundle configuration (trace only)
 */
export async function explainBundle(opts: ExplainBundleOptions): Promise<MergeTrace[]> {
  const bundle = await loadBundle({
    cwd: opts.cwd,
    product: opts.product,
    profileId: opts.profileId,
    scopeId: opts.scopeId,
    cli: opts.cli,
  });

  return bundle.trace;
}
