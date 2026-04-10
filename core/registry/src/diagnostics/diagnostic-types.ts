/**
 * @module @kb-labs/core-registry/diagnostics/diagnostic-types
 * Re-export discovery diagnostics + registry-level report type.
 */

// All diagnostic types come from core-discovery
export type {
  DiagnosticEvent,
  DiagnosticSeverity,
  DiagnosticCode,
} from '@kb-labs/core-discovery';

export type { DiagnosticReport } from '../types.js';
