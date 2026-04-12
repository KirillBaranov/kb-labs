/**
 * POST /sessions/:sessionId/plan/approve
 * Mark current session plan as approved.
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { SessionManager } from '@kb-labs/agent-core';
import type { ApproveSessionPlanRequest, ApproveSessionPlanResponse, TaskPlan } from '@kb-labs/agent-contracts';
import { promises as fs } from 'node:fs';

interface ApprovePlanRouteParams {
  sessionId?: string;
}

async function loadPlan(planPath: string): Promise<TaskPlan> {
  const content = await fs.readFile(planPath, 'utf-8');
  return JSON.parse(content) as TaskPlan;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<ApproveSessionPlanRequest, unknown, ApprovePlanRouteParams>
  ): Promise<ApproveSessionPlanResponse> {
    const params = input.params as Record<string, string> | undefined;
    const sessionId = params?.sessionId;
    const body = (input.body ?? {}) as ApproveSessionPlanRequest;

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    const baseManager = new SessionManager(ctx.cwd);
    const session = await baseManager.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const workingDir = session.workingDir || ctx.cwd;
    const sessionManager = new SessionManager(workingDir);
    const planPath = sessionManager.getSessionPlanPath(sessionId);

    let plan: TaskPlan;
    try {
      plan = await loadPlan(planPath);
    } catch {
      throw new Error(`Plan not found for session ${sessionId}`);
    }

    const approvedAt = new Date().toISOString();
    const approvedPlan = {
      ...plan,
      status: 'approved' as const,
      updatedAt: approvedAt,
      approvalComment: body.comment?.trim() || undefined,
      approvedAt,
    } as TaskPlan;

    await fs.writeFile(planPath, JSON.stringify(approvedPlan, null, 2), 'utf-8');

    ctx.platform.logger.info(`[approve-session-plan] Session ${sessionId}: plan approved`);

    return {
      sessionId,
      plan: approvedPlan,
      approvedAt,
    };
  },
});
