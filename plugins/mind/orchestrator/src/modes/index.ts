/**
 * Mode-specific configurations and utilities
 *
 * The actual mode logic is in the orchestrator.
 * This module can be extended for mode-specific customizations.
 */

export const MODE_DESCRIPTIONS = {
  instant: 'Fast lookup (~500ms), no LLM decomposition',
  auto: 'Balanced mode (~2-3s), 2-3 LLM calls',
  thinking: 'Deep analysis (~5-10s), 4-7 LLM calls with iterations',
} as const;

export const MODE_TIMEOUTS = {
  instant: 5000,     // 5 seconds
  auto: 30000,       // 30 seconds
  thinking: 120000,  // 2 minutes
} as const;
