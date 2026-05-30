/**
 * @module @kb-labs/rest-api-app/diagnostics/header-debug
 * In-memory buffer for recent header policy decisions (debug & dry-run).
 */

export interface HeaderDebugEntry {
  timestamp: number;
  requestId: string;
  pluginId?: string;
  routeId?: string;
  direction: 'inbound' | 'outbound';
  header: string;
  allowed?: boolean;
  reason?: string;
  action?: string;
  dryRun: boolean;
}

const MAX_ENTRIES = 200;
const buffer: HeaderDebugEntry[] = [];

export function recordHeaderDebug(entry: HeaderDebugEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_ENTRIES);
  }
}

export function getHeaderDebugEntries(limit = 50): HeaderDebugEntry[] {
  if (buffer.length === 0) {
    return [];
  }
  const clamped = Math.max(1, Math.min(limit, MAX_ENTRIES));
  return buffer.slice(-clamped).reverse();
}


