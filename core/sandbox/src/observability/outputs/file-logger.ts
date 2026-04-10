/**
 * @module @kb-labs/core-sandbox/observability/outputs/file-logger
 * Reliable file-based event logger
 *
 * Key features:
 * - Append-only (survives crashes)
 * - JSONL format (one event per line)
 * - Automatic rotation (>100MB)
 * - Non-blocking (async writes)
 * - Never throws (errors logged to stderr)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ObservabilityEvent } from '../events/schema';
import type { EventSink, EventSinkOptions } from './types';

export interface FileLoggerOptions extends EventSinkOptions {
  /** Directory for log files */
  logDir?: string;

  /** Log file name pattern */
  filePattern?: string; // e.g., 'kb-{pid}-{timestamp}.log'

  /** Max file size before rotation (bytes) */
  maxFileSize?: number;

  /** Buffer size before flush (events) */
  bufferSize?: number;

  /** Flush interval (ms) */
  flushInterval?: number;
}

/**
 * File-based event logger (JSONL format)
 *
 * Thread-safe, crash-resistant, non-blocking
 */
export class FileLogger implements EventSink {
  private readonly logDir: string;
  private readonly filePattern: string;
  private readonly maxFileSize: number;
  private readonly bufferSize: number;
  private readonly flushInterval: number;
  private readonly enabled: boolean;

  private currentFilePath: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private currentFileSize: number = 0;

  constructor(options: FileLoggerOptions = { name: 'file-logger' }) {
    this.logDir = options.logDir || '/tmp';
    this.filePattern = options.filePattern || 'kb-{pid}-{timestamp}.log';
    this.maxFileSize = options.maxFileSize || 100 * 1024 * 1024; // 100MB
    this.bufferSize = options.bufferSize || 100; // events
    this.flushInterval = options.flushInterval || 1000; // 1s
    this.enabled = options.enabled ?? true;

    if (this.enabled) {
      this.initialize();
    }
  }

  /**
   * Initialize logger and create first log file
   */
  private initialize(): void {
    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // Create initial log file
      this.rotateFile();

      // Start flush timer
      this.flushTimer = setInterval(() => {
        this.flush().catch(err => {
          process.stderr.write(`[FileLogger] Flush error: ${err}\n`);
        });
      }, this.flushInterval);

      // Cleanup on process exit
      process.on('exit', () => {
        this.flushSync();
      });

      process.on('SIGINT', () => {
        this.flushSync();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        this.flushSync();
        process.exit(0);
      });

    } catch (err) {
      process.stderr.write(`[FileLogger] Init error: ${err}\n`);
    }
  }

  /**
   * Write event (non-blocking)
   */
  write(event: ObservabilityEvent): void {
    if (!this.enabled) {
      return;
    }

    try {
      // Serialize event to JSONL (one line)
      const line = JSON.stringify(event) + '\n';

      // Add to buffer
      this.buffer.push(line);

      // Flush if buffer full
      if (this.buffer.length >= this.bufferSize) {
        this.flush().catch(err => {
          process.stderr.write(`[FileLogger] Flush error: ${err}\n`);
        });
      }

      // Rotate if file too large
      if (this.currentFileSize > this.maxFileSize) {
        this.rotateFile();
      }

    } catch (err) {
      // Never throw - log to stderr
      process.stderr.write(`[FileLogger] Write error: ${err}\n`);
    }
  }

  /**
   * Flush buffered events to disk
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.writeStream) {
      return;
    }

    try {
      const data = this.buffer.join('');
      this.buffer = [];

      // Write to stream
      await new Promise<void>((resolve, reject) => {
        this.writeStream!.write(data, (err) => {
          if (err) {
            reject(err);
          } else {
            this.currentFileSize += Buffer.byteLength(data, 'utf8');
            resolve();
          }
        });
      });

    } catch (err) {
      process.stderr.write(`[FileLogger] Flush error: ${err}\n`);
    }
  }

  /**
   * Synchronous flush (for process exit)
   */
  private flushSync(): void {
    if (this.buffer.length === 0 || !this.writeStream) {
      return;
    }

    try {
      const data = this.buffer.join('');
      this.buffer = [];

      // Synchronous write
      fs.writeSync((this.writeStream as any).fd, data);
      this.currentFileSize += Buffer.byteLength(data, 'utf8');

    } catch (err) {
      process.stderr.write(`[FileLogger] Sync flush error: ${err}\n`);
    }
  }

  /**
   * Rotate to new log file
   */
  private rotateFile(): void {
    try {
      // Close existing stream
      if (this.writeStream) {
        this.flushSync();
        this.writeStream.end();
      }

      // Generate new file path
      const fileName = this.filePattern
        .replace('{pid}', String(process.pid))
        .replace('{timestamp}', String(Date.now()));

      this.currentFilePath = path.join(this.logDir, fileName);
      this.currentFileSize = 0;

      // Create new write stream
      this.writeStream = fs.createWriteStream(this.currentFilePath, {
        flags: 'a', // append
        encoding: 'utf8',
      });

      this.writeStream.on('error', (err) => {
        process.stderr.write(`[FileLogger] Stream error: ${err}\n`);
      });

      // Write header
      const header = {
        type: 'file-header',
        version: '1.0',
        pid: process.pid,
        timestamp: Date.now(),
        filePath: this.currentFilePath,
      };
      this.writeStream.write(JSON.stringify(header) + '\n');

    } catch (err) {
      process.stderr.write(`[FileLogger] Rotate error: ${err}\n`);
    }
  }

  /**
   * Close logger
   */
  async close(): Promise<void> {
    try {
      // Stop flush timer
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      // Final flush
      await this.flush();

      // Close stream
      if (this.writeStream) {
        await new Promise<void>((resolve) => {
          this.writeStream!.end(() => resolve());
        });
        this.writeStream = null;
      }

    } catch (err) {
      process.stderr.write(`[FileLogger] Close error: ${err}\n`);
    }
  }

  /**
   * Get current log file path
   */
  getCurrentLogFile(): string | null {
    return this.currentFilePath;
  }
}

/**
 * Create FileLogger with defaults
 */
export function createFileLogger(options?: Partial<FileLoggerOptions>): FileLogger {
  return new FileLogger({
    name: 'file-logger',
    ...options,
  });
}
