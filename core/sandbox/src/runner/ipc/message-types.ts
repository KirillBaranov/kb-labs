/**
 * @module @kb-labs/core-sandbox/runner/ipc/message-types
 * IPC message type definitions
 */

import type { HandlerRef, ExecutionContext } from '../../types/index';
import type { SerializableContext } from '../ipc-serializer';
import type { PermissionSpec, ManifestV3 } from '@kb-labs/plugin-contracts';

/**
 * IPC message from parent process
 * Note: UI_EVENT removed - stdout piping is used instead (ADR-0013)
 */
export interface IpcMessage {
  type: 'RUN' | 'READY' | 'LOG' | 'ERR' | 'CRASH';
  payload?: {
    handlerRef?: HandlerRef;
    input?: unknown;
    ctx?: SerializableContext | ExecutionContext;
    perms?: PermissionSpec;
    manifest?: ManifestV3;
    error?: {
      code: string;
      message: string;
      stack?: string;
    };
    data?: unknown;
    report?: string;
    snapshotPath?: string;
    tracePath?: string;
    logPath?: string;
  };
}

/**
 * RUN message payload
 */
export interface RunMessagePayload {
  handlerRef: HandlerRef;
  input: unknown;
  ctx: SerializableContext | ExecutionContext;
  perms?: PermissionSpec;
  manifest?: ManifestV3;
}
