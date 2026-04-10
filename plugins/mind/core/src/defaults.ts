/**
 * Default configurations for KB Labs Mind
 */

import type { ContextBudget, ContextPreset } from "./types/pack";

/**
 * Default context budget
 */
export const DEFAULT_BUDGET: ContextBudget = {
  totalTokens: 9000,
  caps: {
    intent_summary: 300,
    product_overview: 600,
    project_meta: 500,
    api_signatures: 2200,
    recent_diffs: 1200,
    docs_overview: 600,
    impl_snippets: 3000,
    configs_profiles: 700,
  },
  truncation: "middle",
};

/**
 * Default context preset
 */
export const DEFAULT_PRESET: ContextPreset = {
  name: "balanced",
  weight: { 
    overview: 1, 
    api: 1.2, 
    diffs: 1, 
    snippets: 1.4, 
    configs: 0.6,
    meta: 0.8,
    docs: 0.9
  }
};

/**
 * Default time budget for indexing operations (ms)
 */
export const DEFAULT_TIME_BUDGET_MS = 800;

/**
 * Maximum file size to process (bytes)
 */
export const MAX_FILE_SIZE_BYTES = 1.5 * 1024 * 1024; // 1.5MB

/**
 * Maximum lines per snippet
 */
export const MAX_SNIPPET_LINES = 60;

/**
 * Generator string for artifacts
 */
export function getGenerator(): string {
  return "kb-labs-mind@0.1.0";
}
