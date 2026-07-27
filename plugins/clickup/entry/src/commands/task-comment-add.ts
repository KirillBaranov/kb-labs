import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, addTaskComment } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type TaskCommentAddFlags = {
  text: string;
  assignee?: number;
  notify?: boolean;
  json?: boolean;
  full?: boolean;
  'dry-run'?: boolean;
};

export default defineCommand({
  id: 'clickup:task.comment.add',
  description: 'Add a comment to a task',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<TaskCommentAddFlags>) {
      const [taskId] = input.argv;
      return {
        summary: `Add comment to task ${taskId ?? '(unknown)'}`,
        operations: [{ type: 'create' as const, resource: 'comment', details: { taskId, text: input.flags.text } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<TaskCommentAddFlags>) {
      const [taskId] = input.argv;
      if (!taskId) {
        validationError(ctx, 'Task ID is required', 'Usage: kb clickup task comment add <taskId> --text "message"', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
      if (!input.flags.text) {
        validationError(ctx, '--text is required', undefined, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const comment = await addTaskComment(requireApiKey(), taskId, input.flags.text, {
          assignee: input.flags.assignee,
          notifyAll: input.flags.notify,
        });

        if (input.flags.json) {
          if (input.flags.full) {
            ctx.ui?.json?.(comment);
          } else {
            ctx.ui?.json?.({
              id: comment.id,
              date: comment.date,
              ...(comment.comment_text !== undefined ? { comment_text: comment.comment_text } : {}),
              ...(comment.user?.username !== undefined ? { user: comment.user.username } : {}),
            });
          }
        } else {
          ctx.ui?.success?.(`Comment added (id: ${comment.id})`);
        }

        return { ok: true, result: comment };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
