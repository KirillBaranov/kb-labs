/**
 * @module @kb-labs/core-bundle/types/types
 * Bundle system types
 */

import type { MergeTrace, BundleProfile } from '@kb-labs/core-config';

export interface LoadBundleOptions {
  /**
   * Explicit workspace root. If omitted, the resolver will derive it.
   */
  cwd?: string;
  /**
   * Product identifier (e.g., 'mind', 'aiReview', 'workflow')
   * Corresponds to key in kb.config.json profiles[].products
   */
  product: string;
  /**
   * Preferred profile identifier (Profiles v2). Falls back to default selection.
   */
  profileId?: string;
  /**
   * Optional explicit scope identifier (within the resolved profile).
   */
  scopeId?: string;
  cli?: Record<string, unknown>;
  writeFinalConfig?: boolean;
  validate?: boolean | 'warn';
}

export interface Bundle<T = any> {
  product: string;
  config: T;
  profile: BundleProfile | null;
  policy: {
    bundle?: string;
    permits: (action: string, resource?: any) => boolean;
  };
  trace: MergeTrace[];
  artifacts?: {
    summary: Record<string, unknown>;
    list: (type: string) => Promise<Array<{ relPath: string; sha256: string }>>;
  };
}

export interface ExplainBundleOptions {
  /**
   * Explicit workspace root. If omitted, the resolver will derive it.
   */
  cwd?: string;
  product: string;
  profileId?: string;
  scopeId?: string;
  cli?: Record<string, unknown>;
}
