/**
 * GET /sessions/:sessionId - Get session details
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SessionManager } from '@kb-labs/agent-core';
import type { GetSessionResponse } from '@kb-labs/agent-contracts';

interface GetSessionRequest {
  sessionId?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<GetSessionRequest>
  ): Promise<GetSessionResponse> {
    const params = input.params as Record<string, string> | undefined;
    const sessionId = params?.sessionId;

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const sessionManager = new SessionManager(ctx.cwd);
    const session = await sessionManager.getSessionInfo(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return { session };
  },
});
