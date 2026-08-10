/**
 * Tests for commit-plan.ts's LLM gating.
 *
 * BUG-03: `kb commit commit` called the gateway LLM even when the plugin's
 * config had LLM disabled. resolveContext() in run.ts already computed
 * `llmComplete: undefined` for that case, but generateCommitPlan() ignored it
 * and instead checked `useLLM()` directly — which stays truthy whenever the
 * platform has *any* LLM adapter registered, independent of this plugin's
 * llm.enabled setting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { simpleGit } from 'simple-git';
import { createTestContext, mockLLM } from '@kb-labs/sdk/testing';
import { generateCommitPlan } from '../../src/generator/commit-plan';

describe('generateCommitPlan - LLM gating', () => {
  const repoDir = join(process.cwd(), '.test-commit-plan-llm-gating');

  beforeEach(async () => {
    await mkdir(repoDir, { recursive: true });
    const git = simpleGit(repoDir);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    await writeFile(join(repoDir, 'a.ts'), 'export const a = 1;\n');
    await git.add('.');
    await git.commit('chore: initial commit');

    await writeFile(join(repoDir, 'a.ts'), 'export const a = 2;\n');
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it('never calls the gateway LLM when llmComplete is undefined (LLM disabled)', async () => {
    const llm = mockLLM();
    const { cleanup } = createTestContext({ platform: { llm } });

    try {
      const plan = await generateCommitPlan({
        cwd: repoDir,
        llmComplete: undefined, // exactly what resolveContext() passes when config.llm.enabled is false
      });

      expect(llm.complete).not.toHaveBeenCalled();
      expect(llm.chatWithTools).not.toHaveBeenCalled();
      expect(plan.commits.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it('does call the gateway LLM when llmComplete is provided (LLM enabled)', async () => {
    const llm = mockLLM();
    const { cleanup } = createTestContext({ platform: { llm } });

    try {
      await generateCommitPlan({
        cwd: repoDir,
        llmComplete: async (prompt: string) => ({ content: 'feat: update a.ts' }),
      });

      const calledComplete = (llm.complete as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0;
      const calledTools = (llm.chatWithTools as unknown as { mock: { calls: unknown[] } }).mock.calls.length > 0;
      expect(calledComplete || calledTools).toBe(true);
    } finally {
      cleanup();
    }
  });
});
