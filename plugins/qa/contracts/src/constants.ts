/**
 * Data directory for the QA plugin, relative to monorepo root.
 */
export const QA_DATA_DIR = '.kb/qa';

/**
 * File paths for QA plugin data storage (relative to monorepo root).
 */
export const PATHS = {
  BASELINE: '.kb/qa/baseline.json',
  HISTORY: '.kb/qa/history.json',
  CACHE: '.kb/qa/cache.json',
  LAST_RUN: '.kb/qa/last-run.json',
} as const;

/**
 * Maximum number of history entries to keep.
 */
export const HISTORY_MAX_ENTRIES = 50;

/**
 * Default number of entries for trend analysis window.
 */
export const TRENDS_WINDOW = 10;

/**
 * Default labels for built-in check types.
 */
const DEFAULT_LABELS: Record<string, string> = {
  build: 'Build',
  lint: 'Lint',
  typeCheck: 'Type Check',
  test: 'Tests',
};

/**
 * Default icons (emoji) for built-in check types.
 */
const DEFAULT_ICONS: Record<string, string> = {
  build: '🔨',
  lint: '🔍',
  typeCheck: '📘',
  test: '🧪',
};

/**
 * Get display label for a check type. Priority: configName > known default > id.
 */
export function getCheckLabel(id: string, configName?: string): string {
  return configName ?? DEFAULT_LABELS[id] ?? id;
}

/**
 * Get display icon (emoji) for a check type. Priority: configIcon > known default > generic.
 */
export function getCheckIcon(id: string, configIcon?: string): string {
  return configIcon ?? DEFAULT_ICONS[id] ?? '☑️';
}
