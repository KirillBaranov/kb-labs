/**
 * @module @kb-labs/studio-data-client/client/envelope-interceptor
 * Envelope interceptor for automatic unwrap of API responses
 */

import type { ResponseInterceptor } from './types';

/**
 * Envelope response structure
 */
interface EnvelopeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    cause?: string;
    traceId?: string;
  };
  meta?: {
    requestId: string;
    durationMs: number;
    apiVersion: string;
  };
}

/**
 * Create envelope unwrap interceptor
 * Automatically unwraps { ok: true, data: T } to T
 */
export function createEnvelopeInterceptor(): ResponseInterceptor {
  return async (response: Response): Promise<Response> => {
    // Only process JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      return response;
    }

    // Skip streaming responses
    if (contentType.includes('text/event-stream')) {
      return response;
    }

    // Clone response to avoid consuming the original
    const clonedResponse = response.clone();

    try {
      const envelope = await clonedResponse.json() as EnvelopeResponse;


      // Check if response is an envelope
      if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
        if (envelope.ok === true && 'data' in envelope) {
          // Success envelope: unwrap data
          const unwrappedData = envelope.data;
          
          // Create new headers with Content-Type explicitly set
          const headers = new Headers(response.headers);
          headers.set('Content-Type', 'application/json');
          
          // Create new response with unwrapped data
          return new Response(JSON.stringify(unwrappedData), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } else if (envelope.ok === false && 'error' in envelope) {
          // Error envelope: leave as is for error handler
          return response;
        }
      }

      // Not an envelope, return as is
      return response;
    } catch (_error) {
      // If parsing fails, return original response
      return response;
    }
  };
}

/**
 * Extract envelope metadata from response
 */
export function extractEnvelopeMeta(response: Response): {
  requestId?: string;
  apiVersion?: string;
  durationMs?: number;
} | null {
  try {
    const requestId = response.headers.get('X-Request-Id') || undefined;
    const apiVersion = response.headers.get('X-Schema-Version') || response.headers.get('x-schema-version') || undefined;
    
    return {
      requestId: requestId || undefined,
      apiVersion: apiVersion || undefined,
    };
  } catch {
    return null;
  }
}

