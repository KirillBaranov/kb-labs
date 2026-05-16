import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, getTask, getTaskComments } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';
import { slimTaskWithDesc } from '../utils/slim.js';

type TaskGetFlags = { json?: boolean; full?: boolean };

export default defineCommand({
  id: 'clickup:task.get',
  description: 'Get full task details including comments',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<TaskGetFlags>) {
      const [taskId] = input.argv;
      if (!taskId) {
        validationError(ctx, 'Task ID is required', 'Usage: kb clickup task get <taskId>', input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        const apiKey = requireApiKey();
        const [task, comments] = await Promise.all([
          getTask(apiKey, taskId),
          getTaskComments(apiKey, taskId),
        ]);

        if (input.flags.json) {
          ctx.ui?.json?.(input.flags.full ? { task, comments } : slimTaskWithDesc(task));
          return { exitCode: 0, result: { task, comments } };
        }

        const priority = task.priority?.priority ?? '–';
        const assignees = task.assignees.map(a => a.username).join(', ') || '–';
        const due = task.due_date
          ? new Date(Number(task.due_date)).toLocaleDateString()
          : '–';

        const sections: Array<{ header: string; items: string[] }> = [];

        if (task.description) {
          sections.push({ header: 'Description', items: [task.description] });
        }

        if (comments.length) {
          sections.push({
            header: `Comments (${comments.length})`,
            items: comments.map(c => {
              const date = new Date(Number(c.date)).toLocaleString();
              return `[${c.user.username} @ ${date}] ${c.comment_text}`;
            }),
          });
        }

        ctx.ui?.sideBox?.({
          title: `[${task.id}] ${task.name}`,
          status: 'info',
          summary: {
            'Status':    task.status.status,
            'Priority':  priority,
            'Assignees': assignees,
            'Due':       due,
            'List':      `${task.list.name} / ${task.folder.name}`,
            'URL':       task.url,
          },
          sections,
        });

        return { exitCode: 0, result: { task, comments } };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
