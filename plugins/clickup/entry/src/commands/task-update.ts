import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, updateTask } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type TaskUpdateFlags = {
  name?: string;
  desc?: string;
  status?: string;
  priority?: number;
  assignee_add?: string;
  assignee_rem?: string;
  due?: string;
  json?: boolean;
};

function parseDue(due: string): number | null {
  if (due === 'null' || due === 'none') return null;
  const n = Number(due);
  if (!isNaN(n) && n > 0) return n;
  const d = new Date(due);
  if (!isNaN(d.getTime())) return d.getTime();
  return null;
}

export default defineCommand({
  id: 'clickup:task.update',
  description: 'Update an existing task',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<TaskUpdateFlags>) {
      const [taskId] = input.argv;
      if (!taskId) {
        validationError(ctx, 'Task ID is required', 'Usage: kb clickup task update <taskId> [--name ...] [--status ...]', input.flags.json);
        return { exitCode: 1, result: null };
      }

      const { name, desc, status, priority, assignee_add, assignee_rem, due, json } = input.flags;

      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (desc !== undefined) body.markdown_content = desc.replace(/\\n/g, '\n');
      if (status !== undefined) body.status = status;
      if (priority !== undefined) body.priority = priority;
      if (due !== undefined) body.due_date = parseDue(due);
      if (assignee_add || assignee_rem) {
        body.assignees = {
          add: assignee_add ? assignee_add.split(',').map(Number) : [],
          rem: assignee_rem ? assignee_rem.split(',').map(Number) : [],
        };
      }

      try {
        const task = await updateTask(requireApiKey(), taskId, body);

        if (json) {
          ctx.ui?.json?.(task);
        } else {
          ctx.ui?.success?.('Task updated', {
            sections: [{
              items: [
                `id: ${task.id}`,
                `name: ${task.name}`,
                `status: ${task.status.status}`,
                `url: ${task.url}`,
              ],
            }],
          });
        }

        return { exitCode: 0, result: task };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
