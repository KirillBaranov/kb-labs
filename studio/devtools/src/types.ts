import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

export interface DevToolsChannel<T = unknown> {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  getEvents(): readonly T[];
  push(event: T): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

// ---------------------------------------------------------------------------
// Plugin (channel + row renderer)
// ---------------------------------------------------------------------------

export interface DevToolsLogRow {
  /** Channel this row belongs to */
  channelId: string;
  /** Timestamp for chronological sorting */
  timestamp: number;
  /** Unique row id */
  id: string;
  /** Searchable text — all fields concatenated */
  searchText: string;
  /** The original event */
  event: unknown;
}

export interface DevToolsPlugin<T = unknown> {
  channel: DevToolsChannel<T>;
  /** Render a single log row for this channel's event */
  renderRow(event: T): DevToolsRowContent;
}

export interface DevToolsRowContent {
  /** Status indicator: 'success' | 'warning' | 'error' | 'pending' */
  status: 'success' | 'warning' | 'error' | 'pending';
  /** Main summary text shown in the row */
  summary: string;
  /** Optional right-side label (e.g. "234ms") */
  meta?: string;
  /** Optional detail node shown when row is expanded */
  detail?: ComponentType;
}

// ---------------------------------------------------------------------------
// Built-in event shapes
// ---------------------------------------------------------------------------

export type MFEventStatus = 'loading' | 'success' | 'error' | 'warning';

export interface MFEvent {
  id: string;
  remoteName: string;
  exposedModule: string;
  status: MFEventStatus;
  startedAt: number;
  durationMs?: number;
  attempt: number;
  error?: { message: string; cause?: string };
  isDefaultUndefined?: boolean;
}

export interface EventBusEvent {
  id: string;
  event: string;
  payload: unknown;
  sourcePluginId: string;
  sourcePageId: string;
  timestamp: number;
}
