/**
 * Pipeline Module
 *
 * Pipeline execution with graceful degradation.
 */

export {
  GracefulDegradationHandler,
  createGracefulDegradationHandler,
  getDegradedMode,
  MODE_DEGRADATION_CHAIN,
  type DegradationResult,
  type PipelineStepConfig,
  type GracefulDegradationOptions,
} from './graceful-degradation';
