/**
 * Core types for transport layer.
 * Extracted from @kb-labs/core-platform to avoid circular dependencies.
 */

export interface SerializableBuffer {
  __type: "Buffer";
  data: string;
}

export interface SerializableDate {
  __type: "Date";
  iso: string;
}

export interface SerializableError {
  __type: "Error";
  name: string;
  message: string;
  stack?: string;
  code?: string;
}

export type SerializableValue =
  | null
  | boolean
  | number
  | string
  | SerializableBuffer
  | SerializableDate
  | SerializableError
  | SerializableArray
  | SerializableObject;

export type SerializableArray = SerializableValue[];
export type SerializableObject = { [key: string]: SerializableValue };

export type AdapterType =
  | "vectorStore"
  | "cache"
  | "llm"
  | "embeddings"
  | "storage"
  | "logger"
  | "analytics"
  | "eventBus"
  | "invoke"
  | "artifacts";

export interface AdapterCallContext {
  traceId?: string;
  sessionId?: string;
  pluginId?: string;
  workspaceId?: string;
  tenantId?: string;
  permissions?: {
    adapters?: string[];
    storagePaths?: string[];
    networkHosts?: string[];
  };
}

export const IPC_PROTOCOL_VERSION = 2;

export interface AdapterCall {
  version: number;
  type: "adapter:call";
  requestId: string;
  adapter: AdapterType;
  method: string;
  args: SerializableValue[];
  timeout?: number;
  context?: AdapterCallContext;
}

export interface AdapterResponse {
  type: "adapter:response";
  requestId: string;
  result?: SerializableValue;
  error?: SerializableError;
}

export function isAdapterResponse(msg: unknown): msg is AdapterResponse {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as any).type === "adapter:response" &&
    "requestId" in msg &&
    typeof (msg as any).requestId === "string"
  );
}
