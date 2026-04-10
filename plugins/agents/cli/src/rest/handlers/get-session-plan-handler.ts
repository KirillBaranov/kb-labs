/**
 * GET /sessions/:sessionId/plan
 * Get current session plan (JSON + canonical markdown path if present).
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SessionManager, PlanDocumentService } from '@kb-labs/agent-core';
import type { GetSessionPlanResponse, TaskPlan } from '@kb-labs/agent-contracts';
import { promises as fs } from 'node:fs';

interface GetSessionPlanRequest {
  sessionId?: string;
}

async function loadPlan(planPath: string): Promise<TaskPlan | null> {
  try {
    const content = await fs.readFile(planPath, 'utf-8');
    return JSON.parse(content) as TaskPlan;
  } catch {
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<GetSessionPlanRequest>
  ): Promise<GetSessionPlanResponse> {
    const params = input.params as Record<string, string> | undefined;
    const sessionId = params?.sessionId;
    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const sessionManager = new SessionManager(ctx.cwd);
    const session = await sessionManager.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const workingDir = session.workingDir || ctx.cwd;
    const manager = new SessionManager(workingDir);
    const planPath = manager.getSessionPlanPath(sessionId);
    const plan = await loadPlan(planPath);

    if (!plan) {
      return { sessionId, plan: null };
    }

    const documentService = new PlanDocumentService(workingDir);
    const canonicalPath = documentService.getPlanPath(plan);

    return {
      sessionId,
      plan,
      planPath: await pathExists(canonicalPath) ? canonicalPath : undefined,
    };
  },
});
