/**
 * OpenAI LLM adapter entry point.
 * Re-exports from src/ for clean dist structure.
 */

import { OpenAILLM, type OpenAILLMConfig } from './src/index.js';

// Re-export manifest
export { manifest } from './src/manifest.js';

// Re-export types and class
export { OpenAILLM, type OpenAILLMConfig } from './src/index.js';

/**
 * Create OpenAI LLM adapter.
 */
export function createAdapter(config?: OpenAILLMConfig): OpenAILLM {
  return new OpenAILLM(config);
}

// Default export
export default createAdapter;
