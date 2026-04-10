/**
 * @module @kb-labs/plugin-runtime/__tests__/ipc-log-message
 *
 * Tests for LogMessage in the IPC protocol.
 *
 * LogMessage is a child→parent message that carries real-time log entries
 * from worker/subprocess back to the host process.
 */

import { describe, it, expect } from 'vitest';
import {
  isChildMessage,
  isParentMessage,
  type LogMessage,
  type ChildMessage,
} from '../sandbox/ipc-protocol.js';

describe('IPC Protocol — LogMessage', () => {
  it('should create valid log message', () => {
    const msg: LogMessage = {
      type: 'log',
      entry: {
        level: 'info',
        message: 'Building project...',
        stream: 'stdout',
        lineNo: 1,
        timestamp: '2026-03-13T10:00:00.000Z',
      },
    };

    expect(msg.type).toBe('log');
    expect(msg.entry.level).toBe('info');
    expect(msg.entry.message).toBe('Building project...');
    expect(msg.entry.stream).toBe('stdout');
    expect(msg.entry.lineNo).toBe(1);
  });

  it('should support optional meta field', () => {
    const msg: LogMessage = {
      type: 'log',
      entry: {
        level: 'error',
        message: 'Build failed',
        stream: 'stderr',
        lineNo: 42,
        timestamp: '2026-03-13T10:00:01.000Z',
        meta: { exitCode: 1, command: 'tsc' },
      },
    };

    expect(msg.entry.meta).toEqual({ exitCode: 1, command: 'tsc' });
  });

  it('should be recognized as ChildMessage by isChildMessage', () => {
    const msg = {
      type: 'log',
      entry: {
        level: 'info',
        message: 'test',
        stream: 'stdout',
        lineNo: 1,
        timestamp: new Date().toISOString(),
      },
    };

    expect(isChildMessage(msg)).toBe(true);
  });

  it('should NOT be recognized as ParentMessage', () => {
    const msg = {
      type: 'log',
      entry: {
        level: 'info',
        message: 'test',
        stream: 'stdout',
        lineNo: 1,
        timestamp: new Date().toISOString(),
      },
    };

    expect(isParentMessage(msg)).toBe(false);
  });

  it('should be part of ChildMessage union', () => {
    const messages: ChildMessage[] = [
      { type: 'ready' },
      { type: 'result', data: {} },
      { type: 'error', error: { name: 'Error', message: 'test', code: 'UNKNOWN' } },
      {
        type: 'log',
        entry: {
          level: 'warn',
          message: 'deprecated API',
          stream: 'stderr',
          lineNo: 5,
          timestamp: new Date().toISOString(),
        },
      },
    ];

    expect(messages).toHaveLength(4);
    expect(messages[3]!.type).toBe('log');
  });

  it('should serialize and deserialize through JSON (IPC transport)', () => {
    const msg: LogMessage = {
      type: 'log',
      entry: {
        level: 'info',
        message: 'Compiling 42 files...',
        stream: 'stdout',
        lineNo: 7,
        timestamp: '2026-03-13T10:00:00.000Z',
        meta: { fileCount: 42 },
      },
    };

    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as LogMessage;

    expect(parsed.type).toBe('log');
    expect(parsed.entry.message).toBe('Compiling 42 files...');
    expect(parsed.entry.lineNo).toBe(7);
    expect(parsed.entry.meta).toEqual({ fileCount: 42 });
    expect(isChildMessage(parsed)).toBe(true);
  });
});
