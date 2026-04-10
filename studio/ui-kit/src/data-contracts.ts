/**
 * Data contracts for UIKit components.
 *
 * These types define the expected data shapes for REST API responses
 * that feed UIKit components (UITable, UISelect, etc.).
 * Used by both REST handlers (producing data) and Studio UI (consuming data).
 */

// ─── Table ──────────────────────────────────────────────────────────

export interface TableRow {
  [key: string]: unknown;
}

export interface TableData<T extends TableRow = TableRow> {
  rows: T[];
  total?: number;
}

// ─── Select ─────────────────────────────────────────────────────────

export interface SelectOptionItem {
  label: string;
  value: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

export interface SelectData {
  options: SelectOptionItem[];
  /** Currently selected value */
  value?: string;
  /** Error message if loading failed */
  error?: string;
}

// ─── Metric ─────────────────────────────────────────────────────────

export interface MetricData {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  delta?: string | number;
  unit?: string;
}

// ─── List ───────────────────────────────────────────────────────────

export interface ListItem {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ListData {
  items: ListItem[];
  total?: number;
}
