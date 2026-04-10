/**
 * @module @kb-labs/core-resource-broker/queue/priority-queue
 * Priority queue implementation with three levels: high, normal, low.
 */

import type { QueueItem } from '../types.js';

/**
 * Priority queue with three priority levels.
 *
 * - High priority items are always dequeued first
 * - Within the same priority, items are dequeued FIFO
 * - Supports peeking without removing
 *
 * @example
 * ```typescript
 * const queue = new PriorityQueue();
 *
 * queue.enqueue(item1); // normal priority
 * queue.enqueue(item2); // high priority
 *
 * const next = queue.dequeue(); // returns item2 (high priority)
 * ```
 */
export class PriorityQueue {
  private high: QueueItem[] = [];
  private normal: QueueItem[] = [];
  private low: QueueItem[] = [];

  /**
   * Add an item to the queue.
   *
   * @param item - Queue item to add
   */
  enqueue(item: QueueItem): void {
    const priority = item.request.priority;

    switch (priority) {
      case 'high':
        this.high.push(item);
        break;
      case 'low':
        this.low.push(item);
        break;
      default:
        this.normal.push(item);
    }
  }

  /**
   * Remove and return the highest priority item.
   *
   * @returns The next item or undefined if queue is empty
   */
  dequeue(): QueueItem | undefined {
    if (this.high.length > 0) {
      return this.high.shift();
    }
    if (this.normal.length > 0) {
      return this.normal.shift();
    }
    if (this.low.length > 0) {
      return this.low.shift();
    }
    return undefined;
  }

  /**
   * Peek at the highest priority item without removing it.
   *
   * @returns The next item or undefined if queue is empty
   */
  peek(): QueueItem | undefined {
    if (this.high.length > 0) {
      return this.high[0];
    }
    if (this.normal.length > 0) {
      return this.normal[0];
    }
    if (this.low.length > 0) {
      return this.low[0];
    }
    return undefined;
  }

  /**
   * Get total queue size.
   */
  size(): number {
    return this.high.length + this.normal.length + this.low.length;
  }

  /**
   * Get queue size by priority.
   */
  sizeByPriority(): { high: number; normal: number; low: number } {
    return {
      high: this.high.length,
      normal: this.normal.length,
      low: this.low.length,
    };
  }

  /**
   * Check if queue is empty.
   */
  isEmpty(): boolean {
    return this.size() === 0;
  }

  /**
   * Clear all items from the queue.
   *
   * @returns All removed items (for cleanup/rejection)
   */
  clear(): QueueItem[] {
    const all = [...this.high, ...this.normal, ...this.low];
    this.high = [];
    this.normal = [];
    this.low = [];
    return all;
  }

  /**
   * Remove a specific item by request ID.
   *
   * @param requestId - ID of the request to remove
   * @returns The removed item or undefined if not found
   */
  remove(requestId: string): QueueItem | undefined {
    // Check high priority
    const highIndex = this.high.findIndex(item => item.request.id === requestId);
    if (highIndex !== -1) {
      return this.high.splice(highIndex, 1)[0];
    }

    // Check normal priority
    const normalIndex = this.normal.findIndex(item => item.request.id === requestId);
    if (normalIndex !== -1) {
      return this.normal.splice(normalIndex, 1)[0];
    }

    // Check low priority
    const lowIndex = this.low.findIndex(item => item.request.id === requestId);
    if (lowIndex !== -1) {
      return this.low.splice(lowIndex, 1)[0];
    }

    return undefined;
  }

  /**
   * Get all items for a specific resource.
   *
   * @param resource - Resource identifier
   * @returns Items matching the resource
   */
  getByResource(resource: string): QueueItem[] {
    return [
      ...this.high.filter(item => item.request.resource === resource),
      ...this.normal.filter(item => item.request.resource === resource),
      ...this.low.filter(item => item.request.resource === resource),
    ];
  }

  /**
   * Get queue size for a specific resource.
   *
   * @param resource - Resource identifier
   */
  sizeByResource(resource: string): number {
    return (
      this.high.filter(item => item.request.resource === resource).length +
      this.normal.filter(item => item.request.resource === resource).length +
      this.low.filter(item => item.request.resource === resource).length
    );
  }

  /**
   * Iterate over all items (for inspection, not removal).
   */
  *[Symbol.iterator](): Iterator<QueueItem> {
    yield* this.high;
    yield* this.normal;
    yield* this.low;
  }
}
