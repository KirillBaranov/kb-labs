/**
 * @module @kb-labs/core-sandbox/monitoring/log-collector
 * Ring buffer for log collection
 */

/**
 * Ring buffer for collecting logs with size limit
 */
export class RingBuffer {
  private buffer: string[] = [];
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSizeBytes: number) {
    this.maxSize = maxSizeBytes;
  }

  /**
   * Append a log line to the buffer
   * @param line - Log line to append
   */
  append(line: string): void {
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (this.currentSize + lineBytes > this.maxSize) {
      // Remove oldest entries until we have space
      while (
        this.buffer.length > 0 &&
        this.currentSize + lineBytes > this.maxSize
      ) {
        const removed = this.buffer.shift();
        if (removed) {
          this.currentSize -= Buffer.byteLength(removed, 'utf8');
        }
      }
    }
    this.buffer.push(line);
    this.currentSize += lineBytes;
  }

  /**
   * Get log lines (last N lines or all)
   * @param count - Number of lines to return (undefined = all)
   * @returns Array of log lines
   */
  getLines(count?: number): string[] {
    if (count === undefined) {
      return [...this.buffer];
    }
    return this.buffer.slice(-count);
  }

  /**
   * Clear all log lines
   */
  clear(): void {
    this.buffer = [];
    this.currentSize = 0;
  }
}

