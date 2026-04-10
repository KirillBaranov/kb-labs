/**
 * @module @kb-labs/llm-router/manifest
 * Adapter manifest for LLM Router.
 */

import type { AdapterManifest } from '@kb-labs/core-platform';

/**
 * LLM Router adapter manifest.
 */
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'llm-router',
  name: 'LLM Router',
  version: '0.1.0',
  type: 'proxy', // Wraps/delegates to underlying LLM adapter
  description: 'Adaptive LLM router with tier-based model selection',
  implements: 'ILLM',
  capabilities: {
    streaming: true,
    batch: false,
  },
  // No runtime contexts needed
  contexts: [],
};
