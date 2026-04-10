/**
 * @module @kb-labs/workflow-builtins/gate
 * Types for builtin:gate step
 *
 * Gate steps act as automatic routers — they read a decision value
 * from previous step outputs and route the pipeline accordingly:
 * - continue: proceed to next step
 * - fail: fail the pipeline
 * - restartFrom: reset steps back to target and re-schedule with context
 */

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
}
