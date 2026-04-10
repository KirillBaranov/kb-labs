/**
 * @module @kb-labs/core-platform/serializable
 * IPC serialization for cross-process adapter communication.
 *
 * This module provides types and functions for serializing/deserializing
 * adapter method calls across process boundaries.
 *
 * @example
 * ```typescript
 * import {
 *   serialize,
 *   deserialize,
 *   AdapterCall,
 *   AdapterResponse,
 * } from '@kb-labs/core-platform/serializable';
 * ```
 */

export * from './types';
export * from './serializer';
