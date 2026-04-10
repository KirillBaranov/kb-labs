// Simple CLI utilities for mind-cli
export const colors = {
  red: (text: string) => `[31m${text}[0m`,
  green: (text: string) => `[32m${text}[0m`,
  yellow: (text: string) => `[33m${text}[0m`,
  blue: (text: string) => `[34m${text}[0m`,
  cyan: (text: string) => `[36m${text}[0m`,
  gray: (text: string) => `[90m${text}[0m`,
  bold: (text: string) => `[1m${text}[0m`,
  dim: (text: string) => `[2m${text}[0m`,
};

export const safeColors = colors;

export const safeSymbols = {
  check: '✓',
  cross: '✗',
  arrow: '→',
  bullet: '•',
  info: 'ℹ',
  warning: '⚠',
  error: '✗',
};

export class TimingTracker {
  private startTime: number;
  
  constructor() {
    this.startTime = Date.now();
  }
  
  getElapsed(): number {
    return Date.now() - this.startTime;
  }
  
  getElapsedMs(): number {
    return this.getElapsed();
  }
}

export function formatTiming(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export function box(textOrTitle: string, maybeLines: string[] | string = []): string {
  const lines = Array.isArray(maybeLines)
    ? maybeLines
    : typeof maybeLines === 'string'
      ? maybeLines.split('\n')
      : [];
  const rows = [textOrTitle, ...lines, ''];
  return rows
    .map(line => (line && line.length > 0 ? `│ ${line}` : '│'))
    .join('\n');
}

export function keyValue(entries: Record<string, string | number>): string[];
export function keyValue(key: string, value: string | number): string;
export function keyValue(arg1: any, arg2?: any): string | string[] {
  const format = (key: string, value: string | number) => {
    const label = process.env.NO_COLOR ? key : colors.cyan(key);
    return `${label}: ${value}`;
  };

  if (typeof arg1 === 'string' && arg2 !== undefined) {
    return format(arg1, arg2);
  }

  if (arg1 && typeof arg1 === 'object') {
    return Object.entries(arg1).map(([key, value]) => format(key, value as string | number));
  }

  return '';
}

export function createSpinner(text: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frame = 0;
  
  const interval = setInterval(() => {
    process.stdout.write(`\r${frames[frame]} ${text}`);
    frame = (frame + 1) % frames.length;
  }, 100);
  
  return {
    stop: (finalText?: string) => {
      clearInterval(interval);
      process.stdout.write(`\r${finalText || text}\n`);
    }
  };
}

