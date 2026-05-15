import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, deleteTask } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type TaskDeleteFlags = { force?: boolean; json?: boolean };

export default defineCommand({
  id: 'clickup:task.delete',
  description: 'Delete a task',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<TaskDeleteFlags>) {
      const [taskId] = input.argv;
      if (!taskId) {
        validationError(ctx, 'Task ID is required', 'Usage: kb clickup task delete <taskId> --force', input.flags.json);
        return { exitCode: 1, result: null };
      }

      if (!input.flags.force) {
        validationError(ctx, `--force is required to delete task ${taskId}`, 'Add --force to confirm deletion', input.flags.json);
        return { exitCode: 1, result: null };
      }

      try {
        await deleteTask(requireApiKey(), taskId);

        if (input.flags.json) {
          ctx.ui?.json?.({ ok: true, deleted: true, taskId });
        } else {
          ctx.ui?.success?.(`Deleted task ${taskId}`);
        }

        return { exitCode: 0, result: { deleted: true, taskId } };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { exitCode: 1, result: null };
      }
    },
  },
});
