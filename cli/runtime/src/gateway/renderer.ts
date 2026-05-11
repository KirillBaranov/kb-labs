/**
 * @module cli-core/gateway/renderer
 *
 * Renders execution events to terminal.
 * Minimal UI — stdout/stderr + progress.
 */

import type { ExecutionEvent } from '@kb-labs/core-contracts';
import { sideBorderBox } from '@kb-labs/shared-cli-ui';

/**
 * Renderer interface for execution events.
 */
export interface IEventRenderer {
  /** Render a single event */
  render(event: ExecutionEvent): void;
  /** Finish rendering (cleanup progress bars etc.) */
  finish(): void;
}

/**
 * Standard CLI renderer.
 * - stdout → process.stdout
 * - stderr → process.stderr
 * - progress → \r overwrite (single line)
 * - error → red text to stderr
 * - artifact → "Created: <name> (<size>)"
 * - done → exit code summary
 */
export class TerminalEventRenderer implements IEventRenderer {
  private hasProgress = false;

  render(event: ExecutionEvent): void {
    switch (event.type) {
      case 'execution:output':
        if (event.stream === 'stdout') {process.stdout.write(event.data);}
        if (event.stream === 'stderr') {process.stderr.write(event.data);}
        break;

      case 'execution:progress':
        this.hasProgress = true;
        process.stderr.write(`\r[${event.step}/${event.total}] ${event.label}`);
        break;

      case 'execution:artifact':
        this.clearProgress();
        const size = event.sizeBytes ? ` (${formatBytes(event.sizeBytes)})` : '';
        process.stderr.write(`Created: ${event.name}${size}\n`);
        break;

      case 'execution:error': {
        this.clearProgress();
        const errSections: Array<{ header?: string; items: string[] }> = [
          { items: [event.message] },
        ];
        if (event.code) {
          errSections.push({ header: 'Code', items: [event.code] });
        }
        process.stderr.write('\n' + sideBorderBox({ title: 'Error', sections: errSections, status: 'error' }) + '\n');
        break;
      }

      case 'execution:retry':
        this.clearProgress();
        process.stderr.write('\n' + sideBorderBox({
          title: 'Retrying',
          sections: [{ items: [`Attempt ${event.attempt}/${event.maxAttempts}  —  retry in ${event.delayMs}ms`, event.error] }],
          status: 'warning',
        }) + '\n');
        break;

      case 'execution:cancelled':
        this.clearProgress();
        process.stderr.write('\n' + sideBorderBox({
          title: 'Cancelled',
          sections: [{ items: [event.reason ?? 'No reason given'] }],
          status: 'warning',
        }) + '\n');
        break;

      case 'execution:done':
        this.clearProgress();
        break;
    }
  }

  finish(): void {
    this.clearProgress();
  }

  private clearProgress(): void {
    if (this.hasProgress) {
      process.stderr.write('\r' + ' '.repeat(80) + '\r');
      this.hasProgress = false;
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {return `${bytes} B`;}
  if (bytes < 1024 * 1024) {return `${(bytes / 1024).toFixed(1)} KB`;}
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
