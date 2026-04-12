/**
 * GET /sessions/:sessionId/changes — List file changes for a session.
 * Optional query: ?runId= to scope to a specific agent run.
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SessionManager } from '@kb-labs/agent-core';
import { ChangeStore, toSummary } from '@kb-labs/agent-history';
import type { FileChangeSummary } from '@kb-labs/agent-history';

interface ListFileChangesResponse {
  changes: FileChangeSummary[];
  total: number;
  sessionId: string;
  runId?: string;
}

export default defineHandler({
  async execute(ctx: PluginContextV3, input: RestInput): Promise<ListFileChangesResponse> {
    const params = input.params as Record<string, string> | undefined;
    const sessionId = params?.sessionId;
    if (!sessionId) {throw new Error('Session ID is required');}

    const query = input.query as Record<string, string> | undefined;
    const runId = query?.runId;

    const sessionManager = new SessionManager(ctx.cwd);
    const session = await sessionManager.loadSession(sessionId);
    if (!session) {throw new Error(`Session not found: ${sessionId}`);}

    const workingDir = session.workingDir || ctx.cwd;
    const store = new ChangeStore(workingDir);

    const changes = runId
      ? await store.listRun(sessionId, runId)
      : await store.listSession(sessionId);

    return {
      changes: changes.map(toSummary),
      total: changes.length,
      sessionId,
      runId,
    };
  },
});
