/**
 * Unit tests for CLI utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  colors, 
  safeColors, 
  safeSymbols, 
  TimingTracker, 
  formatTiming, 
  box, 
  keyValue, 
  createSpinner 
} from '../cli/utils';

describe('CLI Utilities', () => {
  describe('colors', () => {
    it('should apply red color', () => {
      const result = colors.red('test');
      expect(result).toContain('\x1b[31m');
      expect(result).toContain('test');
      expect(result).toContain('\x1b[0m');
    });

    it('should apply green color', () => {
      const result = colors.green('test');
      expect(result).toContain('\x1b[32m');
      expect(result).toContain('test');
    });

    it('should apply yellow color', () => {
      const result = colors.yellow('test');
      expect(result).toContain('\x1b[33m');
      expect(result).toContain('test');
    });

    it('should apply blue color', () => {
      const result = colors.blue('test');
      expect(result).toContain('\x1b[34m');
      expect(result).toContain('test');
    });

    it('should apply cyan color', () => {
      const result = colors.cyan('test');
      expect(result).toContain('\x1b[36m');
      expect(result).toContain('test');
    });

    it('should apply gray color', () => {
      const result = colors.gray('test');
      expect(result).toContain('\x1b[90m');
      expect(result).toContain('test');
    });

    it('should apply bold formatting', () => {
      const result = colors.bold('test');
      expect(result).toContain('\x1b[1m');
      expect(result).toContain('test');
    });

    it('should apply dim formatting', () => {
      const result = colors.dim('test');
      expect(result).toContain('\x1b[2m');
      expect(result).toContain('test');
    });
  });

  describe('safeColors', () => {
    it('should be same as colors', () => {
      expect(safeColors).toBe(colors);
    });
  });

  describe('safeSymbols', () => {
    it('should have all required symbols', () => {
      expect(safeSymbols.check).toBe('✓');
      expect(safeSymbols.cross).toBe('✗');
      expect(safeSymbols.arrow).toBe('→');
      expect(safeSymbols.bullet).toBe('•');
      expect(safeSymbols.info).toBe('ℹ');
      expect(safeSymbols.warning).toBe('⚠');
      expect(safeSymbols.error).toBe('✗');
    });
  });

  describe('TimingTracker', () => {
    let tracker: TimingTracker;

    beforeEach(() => {
      tracker = new TimingTracker();
    });

    it('should initialize with current time', () => {
      expect(tracker.getElapsed()).toBeGreaterThanOrEqual(0);
    });

    it('should track elapsed time', async () => {
      const initial = tracker.getElapsed();
      await new Promise<void>(resolve => { setTimeout(resolve, 10); });
      const after = tracker.getElapsed();
      expect(after).toBeGreaterThan(initial);
    });

    it('should return elapsed time in milliseconds', () => {
      const elapsed = tracker.getElapsedMs();
      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(typeof elapsed).toBe('number');
    });
  });

  describe('formatTiming', () => {
    it('should format milliseconds correctly', () => {
      expect(formatTiming(500)).toBe('500ms');
      expect(formatTiming(999)).toBe('999ms');
    });

    it('should format seconds correctly', () => {
      expect(formatTiming(1000)).toBe('1.0s');
      expect(formatTiming(1500)).toBe('1.5s');
      expect(formatTiming(2000)).toBe('2.0s');
    });
  });

  describe('box', () => {
    it('formats content with a single left border', () => {
      const output = box('Title', ['First line', 'Second line']).split('\n');
      expect(output).toEqual([
        '│ Title',
        '│ First line',
        '│ Second line',
        '│',
      ]);
    });

    it('handles empty content', () => {
      const output = box('Only Title', []).split('\n');
      expect(output).toEqual(['│ Only Title', '│']);
    });
  });

  describe('keyValue', () => {
    beforeEach(() => {
      process.env.NO_COLOR = '1';
    });

    afterEach(() => {
      delete process.env.NO_COLOR;
    });

    it('formats string values as key-value pairs', () => {
      const lines = keyValue({ name: 'value' });
      expect(lines).toEqual(['name: value']);
    });

    it('formats numeric values consistently', () => {
      const lines = keyValue({ count: 42 });
      expect(lines).toEqual(['count: 42']);
    });
  });

  describe('createSpinner', () => {
    let originalStdout: any;

    beforeEach(() => {
      originalStdout = process.stdout.write;
      process.stdout.write = vi.fn();
    });

    afterEach(() => {
      process.stdout.write = originalStdout;
    });

    it('should create spinner with text', () => {
      const spinner = createSpinner('Loading...');
      expect(spinner).toHaveProperty('stop');
      expect(typeof spinner.stop).toBe('function');
    });

    it('should stop spinner with final text', () => {
      const spinner = createSpinner('Loading...');
      spinner.stop('Done!');
      
      expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Done!'));
    });

    it('should stop spinner without final text', () => {
      const spinner = createSpinner('Loading...');
      spinner.stop();
      
      expect(process.stdout.write).toHaveBeenCalledWith(expect.stringContaining('Loading...'));
    });
  });
});
