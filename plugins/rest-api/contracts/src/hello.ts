import type { SuccessEnvelope } from './envelopes';

/**
 * Payload returned by the hello service.
 */
export interface HelloPayload {
  schema: 'kb.hello/1';
  message: string;
  ts: string;
}

/**
 * Response envelope for GET /hello
 */
export type HelloResponse = SuccessEnvelope<HelloPayload>;
