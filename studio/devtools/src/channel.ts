import type { DevToolsChannel } from './types.js';

/**
 * Generic ring-buffer channel. Push events in, read them back.
 * Notifies all subscribers on every push/clear.
 */
export class GenericChannel<T = unknown> implements DevToolsChannel<T> {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;

  private events: T[] = [];
  private readonly maxSize: number;
  private listeners = new Set<() => void>();

  constructor(id: string, label: string, icon?: string, maxSize = 200) {
    this.id = id;
    this.label = label;
    this.icon = icon;
    this.maxSize = maxSize;
  }

  getEvents(): readonly T[] {
    return this.events;
  }

  push(event: T): void {
    this.events.push(event);
    if (this.events.length > this.maxSize) {
      this.events.shift();
    }
    this.notify();
  }

  clear(): void {
    this.events = [];
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    this.listeners.forEach((l) => { l(); });
  }
}
