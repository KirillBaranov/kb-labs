import { defineHandler, type PluginContextV3, type RestInput } from '@kb-labs/sdk';
import { requireApiKey, addTaskComment } from '@kb-labs/clickup-core';
import type { AddCommentInput } from '@kb-labs/clickup-contracts';
import { rethrowForRest } from '../../utils/error.js';

export default defineHandler({
  async execute(
    _ctx: PluginContextV3,
    input: RestInput<Record<string, never>, AddCommentInput, { taskId: string }>,
  ) {
    try {
      const apiKey = requireApiKey();
      const taskId = input.params?.taskId;
      if (!taskId) throw new Error('taskId is required');
      if (!input.body) throw new Error('body is required');

      return addTaskComment(apiKey, taskId, input.body.comment_text, {
        assignee: input.body.assignee,
        notifyAll: input.body.notify_all,
      });
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
