/**
 * POST /sessions - Create a new session
 */

import { defineHandler, rethrowForRest, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SessionManager } from '@kb-labs/agent-core';
import type { CreateSessionRequest, CreateSessionResponse } from '@kb-labs/agent-contracts';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<CreateSessionRequest>
  ): Promise<CreateSessionResponse> {
    try {
      const body = input.body as CreateSessionRequest | undefined;

      if (!body?.agentId) {
        throw new Error('Agent ID is required');
      }

      const sessionManager = new SessionManager(ctx.cwd);

      const session = await sessionManager.createSession({
        mode: 'execute',
        task: body.task ?? '',
        agentId: body.agentId,
        name: body.name,
      });

      ctx.platform.logger.info(`[create-session] Created session ${session.id} for agent ${body.agentId}`);

      return { session };
    } catch (err) {
      rethrowForRest(err);
    }
  },
});
