import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger } from '../logger.js';

describe('ConsoleLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;
  const prevEnv = process.env.KB_LOG_LEVEL;

  beforeEach(() => {
    delete process.env.KB_LOG_LEVEL;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    debugSpy.mockRestore();
    if (prevEnv === undefined) {
      delete process.env.KB_LOG_LEVEL;
    } else {
      process.env.KB_LOG_LEVEL = prevEnv;
    }
  });

  it('info/warn/error are emitted at default level', () => {
    const log = new ConsoleLogger();
    log.info('hello');
    log.warn('careful');
    log.error('oops');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[INFO] hello'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[WARN] careful'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR] oops'));
  });

  it('debug/trace are suppressed at default (info) level', () => {
    const log = new ConsoleLogger();
    log.debug('d');
    log.trace('t');
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('respects explicit level=debug', () => {
    const log = new ConsoleLogger({}, 'debug');
    log.debug('d');
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] d'));
  });

  it('silent level suppresses everything', () => {
    const log = new ConsoleLogger({}, 'silent');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('reads KB_LOG_LEVEL from environment', () => {
    process.env.KB_LOG_LEVEL = 'trace';
    const log = new ConsoleLogger();
    log.trace('t');
    expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('[TRACE] t'));
  });

  it('formats metadata as appended JSON', () => {
    const log = new ConsoleLogger();
    log.info('msg', { a: 1 });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('{"a":1}'));
  });

  it('merges bindings with meta', () => {
    const log = new ConsoleLogger({ service: 'gw' });
    log.info('msg', { a: 1 });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"service":"gw"'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"a":1'));
  });

  it('error includes message and stack when Error is given', () => {
    const log = new ConsoleLogger();
    const e = new Error('boom');
    log.error('failed', e, { reqId: 'x' });
    const arg = errorSpy.mock.calls[0]?.[0] as string;
    expect(arg).toContain('[ERROR] failed');
    expect(arg).toContain('"message":"boom"');
    expect(arg).toContain('"reqId":"x"');
  });

  it('fatal uses the same path as error', () => {
    const log = new ConsoleLogger();
    log.fatal('end', new Error('x'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[FATAL] end'));
  });

  it('child inherits bindings and level', () => {
    const log = new ConsoleLogger({ a: 1 }, 'debug');
    const child = log.child({ b: 2 });
    child.debug('msg');
    const arg = debugSpy.mock.calls[0]?.[0] as string;
    expect(arg).toContain('"a":1');
    expect(arg).toContain('"b":2');
  });
});
