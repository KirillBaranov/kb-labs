import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, createTask } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type TaskCreateFlags = {
  list: string;
  name: string;
  desc?: string;
  status?: string;
  priority?: number;
  assignee?: string;
  due?: string;
  json?: boolean;
};

function parseDue(due: string): number | undefined {
  const n = Number(due);
  if (!isNaN(n) && n > 0) return n;
  const d = new Date(due);
  if (!isNaN(d.getTime())) return d.getTime();
  return undefined;
}

export default defineCommand({
  id: 'clickup:task.create',
  description: 'Create a new task',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<TaskCreateFlags>) {
      const { list, name, desc, status, priority, assignee, due, json } = input.flags;

      if (!list) {
        validationError(ctx, '--list is required', 'Use `kb clickup list tasks <listId>` to find the list ID', json);
        return { exitCode: 1, result: null };
      }
      if (!name) {
        validationError(ctx, '--name is required', undefined, json);
        return { exitCode: 1, result: null };
      }

      try {
        const task = await createTask(requireApiKey(), list, {
          name,
          description: desc,
          status,
          priority,
          assignees: assignee ? assignee.split(',').map(Number) : undefined,
          due_date: due ? parseDue(due) : undefined,
        });

        if (json) {
          ctx.ui?.json?.(task);
        } else {
          ctx.ui?.success?.('Task created', {
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
