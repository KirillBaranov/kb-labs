/**
 * Runner Layer Contracts
 *
 * Types for the execution layer (runInProcess, runInSubprocess, etc.)
 * Runner returns host-agnostic result, hosts wrap it into their specific format.
 */

import type { ExecutionMeta } from './execution.js';

/**
 * Options for creating ExecutionMeta
 */
export interface ExecutionMetaOptions {
  pluginId: string;
  pluginVersion: string;
  handlerId?: string;
  requestId: string;
  tenantId?: string;
  startTime: number;
}

/**
 * Create execution metadata with calculated duration
 */
export function createExecutionMeta(options: ExecutionMetaOptions): ExecutionMeta {
  const endTime = Date.now();
  return {
    startTime: options.startTime,
    endTime,
    duration: endTime - options.startTime,
    pluginId: options.pluginId,
    pluginVersion: options.pluginVersion,
    handlerId: options.handlerId,
    requestId: options.requestId,
    tenantId: options.tenantId,
  };
}
