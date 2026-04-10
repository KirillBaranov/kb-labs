import type { DevToolsChannel, DevToolsPlugin } from './types.js';

/**
 * Registry of all DevTools channels.
 * Module-level singleton — instruments code outside the React tree.
 */
export class DevToolsStore {
  private channels = new Map<string, DevToolsChannel>();
  private listeners = new Set<() => void>();
  private channelUnsubs = new Map<string, () => void>();

  registerChannel<T>(channel: DevToolsChannel<T>): void {
    if (this.channels.has(channel.id)) { return; }
    this.channels.set(channel.id, channel as DevToolsChannel);
    // Propagate channel notifications to global listeners
    const unsub = channel.subscribe(() => { this.notify(); });
    this.channelUnsubs.set(channel.id, unsub);
    this.notify();
  }

  unregisterChannel(id: string): void {
    this.channelUnsubs.get(id)?.();
    this.channelUnsubs.delete(id);
    this.channels.delete(id);
    this.notify();
  }

  registerPlugin<T>(plugin: DevToolsPlugin<T>): void {
    this.registerChannel(plugin.channel);
  }

  getChannel<T = unknown>(id: string): DevToolsChannel<T> | undefined {
    return this.channels.get(id) as DevToolsChannel<T> | undefined;
  }

  getChannels(): readonly DevToolsChannel[] {
    return [...this.channels.values()];
  }

  clear(): void {
    this.channels.forEach((ch) => { ch.clear(); });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    this.listeners.forEach((l) => { l(); });
  }
}

/** Global singleton — import this everywhere you want to push events */
export const devToolsStore = new DevToolsStore();
