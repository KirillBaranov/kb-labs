/**
 * Main release runner - orchestrates full release lifecycle
 */

import type {
  ReleaseConfig,
  ReleaseContext,
  ReleaseResult,
  ReleaseStage,
  CheckId,
  CheckResult,
} from './types';

export interface RunnerOptions {
  config: ReleaseConfig;
  context: ReleaseContext;
  runChecks?: (stage: ReleaseStage) => Promise<Partial<Record<CheckId, CheckResult>>>;
  executePlan?: () => Promise<void>;
  onStageChange?: (stage: ReleaseStage) => void;
}

/**
 * Run full release process
 */
export async function runRelease(options: RunnerOptions): Promise<ReleaseResult> {
  const {
    config,
    runChecks,
    executePlan,
    onStageChange,
  } = options;

  const startTime = Date.now();
  const errors: string[] = [];
  let checks: Partial<Record<CheckId, CheckResult>> | undefined;

  try {
    // Stage 1: Planning
    onStageChange?.('planning');
    
    // Stage 2: Pre-release checks
    if (config.verify && config.verify.length > 0 && runChecks) {
      onStageChange?.('checking');
      checks = await runChecks('checking');
      
      // Check if any checks failed
      const failedChecks = Object.entries(checks)
        .filter(([_, result]) => result && !result.ok)
        .map(([id]) => id);
      
      if (failedChecks.length > 0) {
        errors.push(`Pre-release checks failed: ${failedChecks.join(', ')}`);
        
        if (config.strict) {
          return {
            ok: false,
            timingMs: Date.now() - startTime,
            errors,
            checks,
          };
        }
      }
    }

    // Stage 3: Versioning and publishing
    onStageChange?.('publishing');
    
    if (executePlan) {
      await executePlan();
    }

    // Stage 4: Verification
    onStageChange?.('verifying');
    
    return {
      ok: errors.length === 0,
      timingMs: Date.now() - startTime,
      errors: errors.length > 0 ? errors : undefined,
      checks,
    };
  } catch (error) {
    // Rollback on error
    onStageChange?.('rollback');
    
    errors.push(error instanceof Error ? error.message : String(error));
    
    return {
      ok: false,
      timingMs: Date.now() - startTime,
      errors,
      checks,
    };
  }
}

