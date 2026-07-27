import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { requireApiKey, getTaskComments } from '@kb-labs/clickup-core';
import { handleError, validationError } from '../utils/error.js';

type TaskCommentListFlags = { json?: boolean; full?: boolean };

export default defineCommand({
  id: 'clickup:task.comment.list',
  description: 'List comments on a task',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<TaskCommentListFlags>) {
      const [taskId] = input.argv;
      if (!taskId) {
        validationError(ctx, 'Task ID is required', 'Usage: kb clickup task comment list <taskId>', input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }

      try {
        const comments = await getTaskComments(requireApiKey(), taskId);

        if (input.flags.json) {
          ctx.ui?.json?.(input.flags.full ? comments : comments.map(c => ({ id: c.id, user: c.user.username, comment_text: c.comment_text, date: c.date })));
          return { ok: true, result: comments };
        }

        if (!comments.length) {
          ctx.ui?.info?.('No comments.');
          return { ok: true, result: comments };
        }

        ctx.ui?.chain?.(comments.map(c => {
          const date = new Date(Number(c.date)).toLocaleString();
          return {
            title: `${c.user.username}  @  ${date}`,
            sections: [{ items: [c.comment_text] }],
          };
        }));

        return { ok: true, result: comments };
      } catch (err) {
        handleError(ctx, err, input.flags.json);
        return { ok: false, error: 'Command failed', result: null };
      }
    },
  },
});
