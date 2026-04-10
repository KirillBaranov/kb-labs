/**
 * WebSocket types for V3 Plugin System
 *
 * Defines message structure, sender interface, and lifecycle events.
 */

/**
 * WebSocket message structure
 *
 * All messages exchanged between client and server follow this format.
 */
export interface WSMessage {
  /** Message type/event name (e.g., "progress", "complete") */
  type: string;
  /** Message payload (type-specific data) */
  payload?: unknown;
  /** Message ID (for request/response pattern or correlation) */
  messageId?: string;
  /** Timestamp (milliseconds since epoch) */
  timestamp: number;
}

/**
 * WebSocket send interface
 *
 * Provides methods for sending messages to WebSocket clients.
 */
export interface WSSender {
  /**
   * Send message to this specific client
   */
  send(message: WSMessage): Promise<void>;

  /**
   * Broadcast message to all clients in this channel
   *
   * @param message - Message to broadcast
   * @param excludeSelf - If true, don't send to the current connection (default: true)
   */
  broadcast(message: WSMessage, excludeSelf?: boolean): Promise<void>;

  /**
   * Send message to specific connection(s) by ID
   *
   * @param connectionIds - Array of connection IDs to send to
   * @param message - Message to send
   */
  sendTo(connectionIds: string[], message: WSMessage): Promise<void>;

  /**
   * Close this WebSocket connection
   *
   * @param code - WebSocket close code (default: 1000 = normal closure)
   * @param reason - Human-readable close reason
   */
  close(code?: number, reason?: string): void;

  /**
   * Get the unique connection ID for this client
   */
  getConnectionId(): string;
}

/**
 * WebSocket lifecycle events
 *
 * These events are fired during the WebSocket connection lifecycle.
 */
export type WSLifecycleEvent = 'connect' | 'message' | 'disconnect' | 'error';

/**
 * WebSocket handler input
 *
 * Passed to handler execute() method to indicate which lifecycle event occurred.
 */
export interface WSInput {
  /** Lifecycle event type */
  event: WSLifecycleEvent;

  /** Message data (only present for 'message' event) */
  message?: WSMessage;

  /** Error details (only present for 'error' event) */
  error?: Error;

  /** Disconnect code (only present for 'disconnect' event) */
  disconnectCode?: number;

  /** Disconnect reason (only present for 'disconnect' event) */
  disconnectReason?: string;

  /** WebSocket sender interface (present for all events except 'disconnect') */
  sender?: WSSender;
}
