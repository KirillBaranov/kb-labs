/**
 * Multi-step task runner with visual progress.
 * Each task shows as ○ pending → spinner running → ● done / ✗ failed.
 *
 * @example
 * await runTasks([
 *   { title: 'Install dependencies', run: async () => { ... } },
 *   { title: 'Build', run: async () => { ... } },
 * ])
 */

import { safeColors } from './colors.js';
import { clearLines } from './interactive/terminal.js';

export interface Task {
  title: string;
  run: (updateTitle: (t: string) => void) => Promise<void>;
}

type TaskState = 'pending' | 'running' | 'done' | 'failed';

interface TaskStatus {
  title: string;
  state: TaskState;
  error?: string;
}

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];

function renderTasks(statuses: TaskStatus[], spinnerFrame: number): number {
  const lines: string[] = [];
  for (const s of statuses) {
    let prefix: string;
    switch (s.state) {
      case 'pending':
        prefix = safeColors.muted('○');
        break;
      case 'running':
        prefix = safeColors.primary(SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length] ?? '◆');
        break;
      case 'done':
        prefix = safeColors.success('●');
        break;
      case 'failed':
        prefix = safeColors.error('✗');
        break;
    }
    lines.push(`  ${prefix}  ${s.state === 'done' ? safeColors.muted(s.title) : s.state === 'failed' ? safeColors.error(s.title) : s.title}`);
    if (s.error) {
      lines.push(`     ${safeColors.muted(s.error)}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
  return lines.length;
}

export async function runTasks(tasks: Task[]): Promise<void> {
  const statuses: TaskStatus[] = tasks.map((t) => ({ title: t.title, state: 'pending' as TaskState }));
  let lineCount = 0;
  let spinnerFrame = 0;

  // Initial render
  lineCount = renderTasks(statuses, spinnerFrame);

  let spinnerInterval: ReturnType<typeof setInterval> | undefined;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const status = statuses[i];
    if (!task || !status) {continue;}

    status.state = 'running';
    clearLines(lineCount);
    lineCount = renderTasks(statuses, spinnerFrame);

    spinnerInterval = setInterval(() => {
      spinnerFrame++;
      clearLines(lineCount);
      lineCount = renderTasks(statuses, spinnerFrame);
    }, 80);

    try {
      await task.run((newTitle) => {
        status.title = newTitle;
      });
      status.state = 'done';
    } catch (err) {
      status.state = 'failed';
      status.error = err instanceof Error ? err.message : String(err);
    } finally {
      clearInterval(spinnerInterval);
      spinnerInterval = undefined;
    }
  }

  // Final render without spinner
  clearLines(lineCount);
  renderTasks(statuses, 0);
  process.stdout.write('\n');

  const failed = statuses.filter((s) => s.state === 'failed');
  if (failed.length > 0) {
    throw new Error(`${failed.length} task${failed.length === 1 ? '' : 's'} failed`);
  }
}
