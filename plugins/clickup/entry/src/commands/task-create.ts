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
  parent?: string;
  json?: boolean;
  full?: boolean;
  'dry-run'?: boolean;
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
    async intent(_ctx: PluginContextV3, input: CLIInput<TaskCreateFlags>) {
      const { list, name } = input.flags;
      return {
        summary: `Create task "${name ?? '(unnamed)'}" in list ${list ?? '(unknown)'}`,
        operations: [{ type: 'create' as const, resource: 'task', details: { list, name } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<TaskCreateFlags>) {
      const { list, name, desc, status, priority, assignee, due, parent, json, full } = input.flags;

      if (!list) {
        validationError(ctx, '--list is required', 'Use `kb clickup list tasks <listId>` to find the list ID', json);
        return { ok: false, error: 'Command failed', result: null };
      }
      if (!name) {
        validationError(ctx, '--name is required', undefined, json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const task = await createTask(requireApiKey(), list, {
          name,
          markdown_content: desc?.replace(/\\n/g, '\n'),
          status,
          priority,
          assignees: assignee ? assignee.split(',').map(Number) : undefined,
          due_date: due ? parseDue(due) : undefined,
          parent,
        });

        if (json) {
          ctx.ui?.json?.(full ? task : { id: task.id, name: task.name, status: task.status.status, url: task.url });
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

        return { ok: true, result: task };
      } catch (err) {
        handleError(ctx, err, json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
