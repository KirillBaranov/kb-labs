/** Host-owned SSE sender passed to declarative plugin event streams. */
export interface EventStreamSender {
  send(event: string, data: unknown, id?: string): boolean;
  comment(comment: string): boolean;
  onCleanup(cleanup: () => void): void;
  close(reason?: string): void;
}

export type EventStreamLifecycleEvent = "connect" | "disconnect" | "error";

export interface EventStreamInput {
  event: EventStreamLifecycleEvent;
  sender?: EventStreamSender;
  error?: Error;
}
