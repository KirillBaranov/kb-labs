/**
 * Session management REST handlers
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SessionManager } from '@kb-labs/agent-core';
import type {
  ListSessionsRequest,
  ListSessionsResponse,
  GetSessionRequest,
  GetSessionResponse,
  CreateSessionRequest,
  CreateSessionResponse,
} from '@kb-labs/agent-contracts';

/**
 * GET /sessions - List all sessions
 */
export const listSessionsHandler = defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<ListSessionsRequest>
  ): Promise<ListSessionsResponse> {
    const query = input.query as ListSessionsRequest | undefined;
    const sessionManager = new SessionManager(ctx.cwd);

    const result = await sessionManager.listSessions({
      agentId: query?.agentId,
      status: query?.status,
      limit: query?.limit ?? 50,
      offset: query?.offset ?? 0,
    });

    return {
      sessions: result.sessions,
      total: result.total,
    };
  },
});

/**
 * GET /sessions/:sessionId - Get session details
 */
export const getSessionHandler = defineHandler({
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

/**
 * POST /sessions - Create a new session
 */
export const createSessionHandler = defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<CreateSessionRequest>
  ): Promise<CreateSessionResponse> {
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

    ctx.platform.logger.info(`[sessions-handler] Created session ${session.id} for agent ${body.agentId}`);

    return { session };
  },
});
