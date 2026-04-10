import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { setJsonMode, isJsonMode, useLoader, Loader } from '../loader';

// Restore json mode after each test
afterEach(() => {
  setJsonMode(false);
});

describe('setJsonMode / isJsonMode', () => {
  it('defaults to false', () => {
    expect(isJsonMode()).toBe(false);
  });

  it('setJsonMode(true) flips the flag', () => {
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
  });

  it('setJsonMode(false) resets the flag', () => {
    setJsonMode(true);
    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
  });
});

describe('useLoader picks up global json mode', () => {
  it('creates a Loader with jsonMode=false by default', () => {
    const loader = useLoader('test');
    // start() should normally start the interval — but we can verify it doesn't
    // write anything if we capture stdout
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.start();
    // Fake enough time for the interval to fire
    vi.useFakeTimers();
    vi.advanceTimersByTime(500);
    vi.useRealTimers();
    loader.stop();
    write.mockRestore();
    // No assertion needed — just verify it doesn't throw
  });

  it('when setJsonMode(true), useLoader returns a no-op loader', () => {
    setJsonMode(true);
    const loader = useLoader('loading...');

    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.start();
    loader.succeed('done');
    loader.fail('error');
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('explicit jsonMode option overrides global flag', () => {
    setJsonMode(true);
    // Explicit false should override the global true
    const loader = useLoader('test', { jsonMode: false });
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.succeed('done');
    // succeed() writes when jsonMode=false
    expect(write).toHaveBeenCalled();
    write.mockRestore();
  });
});

describe('Loader in json mode suppresses all output', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() does not write to stdout', () => {
    const loader = new Loader({ text: 'loading...', jsonMode: true });
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.start();
    vi.advanceTimersByTime(1000);
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('succeed() does not write to stdout', () => {
    const loader = new Loader({ text: 'loading...', jsonMode: true });
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.start();
    loader.succeed('completed');
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it('fail() does not write to stdout', () => {
    const loader = new Loader({ text: 'loading...', jsonMode: true });
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.start();
    loader.fail('failed');
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });
});

describe('Loader in normal mode writes to stdout', () => {
  it('succeed() writes success symbol to stdout', () => {
    const loader = new Loader({ text: 'loading...', jsonMode: false });
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.succeed('done');
    expect(write).toHaveBeenCalledWith(expect.stringContaining('done'));
    write.mockRestore();
  });

  it('fail() writes error symbol to stdout', () => {
    const loader = new Loader({ text: 'loading...', jsonMode: false });
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    loader.fail('oops');
    expect(write).toHaveBeenCalledWith(expect.stringContaining('oops'));
    write.mockRestore();
  });
});
