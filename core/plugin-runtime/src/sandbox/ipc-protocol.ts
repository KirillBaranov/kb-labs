/**
 * IPC Protocol for sandbox communication
 *
 * Defines message types between parent and child process.
 */

import type { PluginContextDescriptor, SerializedError } from '@kb-labs/plugin-contracts';

/**
 * Message from parent to child: Execute handler
 */
export interface ExecuteMessage {
  type: 'execute';
  descriptor: PluginContextDescriptor;
  socketPath: string;
  handlerPath: string;
  input: unknown;
  cwd: string;
  outdir?: string;
}

/**
 * Message from parent to child: Abort execution
 */
export interface AbortMessage {
  type: 'abort';
}

/**
 * Union of messages from parent to child
 */
export type ParentMessage = ExecuteMessage | AbortMessage;

/**
 * Message from child to parent: Execution result
 *
 * Contains raw handler return value — no host-specific wrapping.
 * Host layer (CLI, REST, Workflow) is responsible for interpreting the data.
 */
export interface ResultMessage {
  type: 'result';
  data: unknown;
}

/**
 * Message from child to parent: Execution error
 */
export interface ErrorMessage {
  type: 'error';
  error: SerializedError;
}

/**
 * Message from child to parent: Ready to receive
 */
export interface ReadyMessage {
  type: 'ready';
}

/**
 * Message from child to parent: Log line emitted during execution.
 * Sent in real-time as handler produces output (platform.logger, shell stdout/stderr).
 */
export interface LogMessage {
  type: 'log';
  entry: {
    level: string;
    message: string;
    stream: 'stdout' | 'stderr';
    lineNo: number;
    timestamp: string;
    meta?: Record<string, unknown>;
  };
}

/**
 * Union of messages from child to parent
 */
export type ChildMessage = ResultMessage | ErrorMessage | ReadyMessage | LogMessage;

/**
 * Type guard for ParentMessage
 */
export function isParentMessage(msg: unknown): msg is ParentMessage {
  if (typeof msg !== 'object' || msg === null) {return false;}
  const m = msg as { type?: unknown };
  return m.type === 'execute' || m.type === 'abort';
}

/**
 * Type guard for ChildMessage
 */
export function isChildMessage(msg: unknown): msg is ChildMessage {
  if (typeof msg !== 'object' || msg === null) {return false;}
  const m = msg as { type?: unknown };
  return m.type === 'result' || m.type === 'error' || m.type === 'ready' || m.type === 'log';
}
