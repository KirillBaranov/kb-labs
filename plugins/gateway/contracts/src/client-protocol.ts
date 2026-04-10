/**
 * @module gateway-contracts/client-protocol
 *
 * WS protocol for observer clients (CLI, Studio, IDE).
 * Endpoint: /clients/connect
 *
 * Separate from host-protocol (protocol.ts) — clients observe executions,
 * they don't serve adapter calls.
 *
 * Client → Gateway inbound messages:
 *   - client:hello     — handshake
 *   - client:subscribe — subscribe to execution events
 *   - client:unsubscribe
 *   - client:cancel    — cancel an execution (convenience, same as POST /execute/:id/cancel)
 *
 * Gateway → Client outbound messages:
 *   - client:connected   — handshake ack
 *   - execution:output   — (reused from protocol.ts ExecutionEventMessage)
 *   - execution:progress
 *   - execution:artifact
 *   - execution:error
 *   - execution:done
 *   - client:error       — protocol-level error (bad subscribe, not found, etc.)
 */

import { z } from 'zod';
import type { ExecutionEventMessage } from './protocol.js';

// ── Inbound (Client → Gateway) ────────────────────────────────────────────────

export const ClientHelloSchema = z.object({
  type: z.literal('client:hello'),
  clientVersion: z.string(),
});

export const ClientSubscribeSchema = z.object({
  type: z.literal('client:subscribe'),
  executionId: z.string().uuid(),
});

export const ClientUnsubscribeSchema = z.object({
  type: z.literal('client:unsubscribe'),
  executionId: z.string().uuid(),
});

export const ClientCancelSchema = z.object({
  type: z.literal('client:cancel'),
  executionId: z.string().uuid(),
  reason: z.enum(['user', 'timeout']).optional(),
});

// ── Outbound (Gateway → Client) ───────────────────────────────────────────────

export const ClientConnectedSchema = z.object({
  type: z.literal('client:connected'),
  protocolVersion: z.string(),
  connectionId: z.string(),
});

export const ClientErrorSchema = z.object({
  type: z.literal('client:error'),
  code: z.enum([
    'EXECUTION_NOT_FOUND',
    'FORBIDDEN',
    'INVALID_MESSAGE',
    'CANCEL_FAILED',
  ]),
  message: z.string(),
  executionId: z.string().optional(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type ClientHello = z.infer<typeof ClientHelloSchema>;
export type ClientSubscribe = z.infer<typeof ClientSubscribeSchema>;
export type ClientUnsubscribe = z.infer<typeof ClientUnsubscribeSchema>;
export type ClientCancel = z.infer<typeof ClientCancelSchema>;
export type ClientConnected = z.infer<typeof ClientConnectedSchema>;
export type ClientError = z.infer<typeof ClientErrorSchema>;

export type ClientInboundMessage =
  | ClientHello
  | ClientSubscribe
  | ClientUnsubscribe
  | ClientCancel;

export type ClientOutboundMessage =
  | ClientConnected
  | ClientError
  | ExecutionEventMessage;

export const CLIENT_PROTOCOL_VERSION = '1.0';
