/**
 * @module @kb-labs/workflow-steps/gate
 * Types and handler for builtin:gate step
 *
 * Gate steps act as automatic routers — they read a decision value
 * from previous step outputs and route the pipeline accordingly:
 * - continue: proceed to next step
 * - fail: fail the pipeline
 * - restart: reset steps back to target and re-schedule with context
 */

import { resolveValue, type ExpressionContext } from '@kb-labs/workflow-contracts';

/**
 * Route action for a gate decision
 */
export type GateRouteAction =
  | 'continue'
  | 'fail'
  | {
      /** Step ID to restart from */
      restartFrom: string;
      /** Additional context to pass (merged into trigger.payload) */
      context?: Record<string, unknown>;
    };

/**
 * Input for builtin:gate step (spec.with)
 */
export interface GateInput {
  /** Expression path to the decision value (e.g. "steps.review.outputs.passed") */
  decision: string;

  /** Route map: decision value → action */
  routes: Record<string, GateRouteAction>;

  /** Default action if decision value doesn't match any route */
  default?: 'continue' | 'fail';

  /** Maximum number of restart iterations before failing (default: 3) */
  maxIterations?: number;
}

/**
 * Output produced by a resolved gate step
 */
export interface GateOutput {
  /** The decision value that was evaluated */
  decisionValue: unknown;

  /** The action that was taken */
  action: 'continue' | 'fail' | 'restart';

  /** Step ID that was restarted from (if restart) */
  restartFrom?: string;

  /** Current iteration count */
  iteration: number;

  /** Set to true when the gate exhausted its maxIterations budget */
  maxIterationsReached?: boolean;

  [key: string]: unknown;
}

/**
 * Pure decision result from GateHandler.
 * Worker applies the state mutations based on the action.
 */
export type GateDecision =
  | { action: 'continue'; outputs: GateOutput }
  | { action: 'fail'; error: Error; outputs: GateOutput }
  | {
      action: 'restart';
      restartFrom: string;
      context?: Record<string, unknown>;
      outputs: GateOutput;
      nextIteration: number;
    };

/**
 * GateHandler — pure decision function.
 * No I/O, no state mutations. Worker owns the side effects.
 */
export class GateHandler {
  static readonly uses = 'builtin:gate';

  /**
   * @param validRestartTargets Step identifiers (step.id and/or step.spec.id) the
   *   worker is able to reset within the gate's own job. When provided and a
   *   `restartFrom` target is not among them, the gate FAILS instead of
   *   attempting an unsupported cross-job restart — which the worker would
   *   silently degrade into "complete the gate and proceed" (a false green).
   */
  handle(
    input: GateInput,
    exprCtx: ExpressionContext,
    currentIteration: number,
    validRestartTargets?: string[],
  ): GateDecision {
    const maxIterations = input.maxIterations ?? 3;
    const decisionValue = resolveValue(input.decision, exprCtx);
    const decisionKey = String(decisionValue);

    const route: GateRouteAction | undefined =
      input.routes[decisionKey] ?? input.routes[decisionValue as string];
    const action = route ?? input.default ?? 'fail';

    if (action === 'continue') {
      return {
        action: 'continue',
        outputs: { decisionValue, action: 'continue', iteration: currentIteration },
      };
    }

    if (action === 'fail') {
      const failReason =
        (route as { message?: string } | undefined)?.message ??
        `No matching route for value "${decisionKey}"`;
      return {
        action: 'fail',
        error: new Error(`Gate failed: ${failReason}`),
        outputs: { decisionValue, action: 'fail', iteration: currentIteration },
      };
    }

    // restart action
    const restartAction = action as { restartFrom: string; context?: Record<string, unknown> };

    // Guard: the worker can only reset steps within the gate's own job. If the
    // restart target is not one of them (e.g. a different job), the gate cannot
    // recover — fail honestly rather than let the worker silently complete the
    // gate and proceed (which would ship unverified work as a false green).
    if (validRestartTargets && !validRestartTargets.includes(restartAction.restartFrom)) {
      return {
        action: 'fail',
        error: new Error(
          `Gate restartFrom "${restartAction.restartFrom}" does not match any step in this job — ` +
            `cross-job restart is not supported. Failing instead of silently passing.`,
        ),
        outputs: { decisionValue, action: 'fail', iteration: currentIteration },
      };
    }

    const nextIteration = currentIteration + 1;

    if (nextIteration >= maxIterations) {
      return {
        action: 'fail',
        error: new Error(`Gate max iterations reached (${maxIterations}) for step`),
        outputs: {
          decisionValue,
          action: 'fail',
          iteration: currentIteration,
          maxIterationsReached: true,
        },
      };
    }

    return {
      action: 'restart',
      restartFrom: restartAction.restartFrom,
      context: restartAction.context,
      outputs: {
        decisionValue,
        action: 'restart',
        restartFrom: restartAction.restartFrom,
        iteration: nextIteration,
      },
      nextIteration,
    };
  }
}
