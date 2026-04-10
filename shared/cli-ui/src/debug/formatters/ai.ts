import type { DebugEntry, DebugFormat } from '../types';

export function formatDebugEntryAI(entry: DebugEntry): string {
  return JSON.stringify(entry, null, 2);
}

export function formatDebugEntriesAI(entries: DebugEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

export function shouldUseAIFormat(format?: DebugFormat, jsonMode?: boolean): boolean {
  if (jsonMode) {
    return true;
  }
  return format === 'ai';
}

