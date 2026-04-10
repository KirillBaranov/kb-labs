export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';

export type DebugDetailLevel = 'debug' | 'verbose' | 'trace';

export type DebugFormat = 'ai' | 'human';

export type DebugMeta = Record<string, unknown>;

export interface DebugEntry {
  timestamp: number;
  namespace: string;
  level: DebugLevel;
  message: string;
  meta?: DebugMeta;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  duration?: number;
  group?: string;
  groupDepth?: number;
}

export interface DebugContext {
  format?: DebugFormat;
  detailLevel?: DebugDetailLevel;
  namespace?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  groupDepth?: number;
  enabled?: boolean;
}

export interface DebugTreeNode {
  entry: DebugEntry;
  children: DebugTreeNode[];
  depth: number;
}

export interface DebugFilterOptions {
  namespace?: string | RegExp;
  level?: DebugLevel | DebugLevel[];
  timeRange?: {
    from?: number;
    to?: number;
  };
  search?: string;
  traceId?: string;
}

export interface DebugExportOptions {
  format?: 'json' | 'chrome' | 'text';
  path?: string;
  filter?: DebugFilterOptions;
  includeMeta?: boolean;
}

