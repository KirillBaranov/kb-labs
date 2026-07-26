import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, deleteTask } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type TaskDeleteFlags = { yes?: boolean; json?: boolean; 'dry-run'?: boolean };

export default defineCommand({
  id: 'clickup:task.delete',
  description: 'Delete a task',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<TaskDeleteFlags>) {
      const [taskId] = input.argv;
      return {
        summary: `Delete task ${taskId ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'task', details: { taskId } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<TaskDeleteFlags>) {
      const [taskId] = input.argv;
      if (!taskId) {
        validationError(ctx, 'Task ID is required', 'Usage: kb clickup task delete <taskId> --yes', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      if (!input.flags.yes) {
        validationError(ctx, `--yes is required to delete task ${taskId}`, 'Add --yes to confirm deletion', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        await deleteTask(requireApiKey(), taskId);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, deleted: true, taskId });
        } else {
          ctx.ui?.success?.(`Deleted task ${taskId}`);
        }

        return { ok: true, result: { deleted: true, taskId } };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
