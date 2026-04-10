import type {
  ArtifactClient,
  RuntimeEvents,
  RuntimeLogger,
  RuntimeTrace,
  StepContext,
} from './types'

export interface CreateStepContextInput {
  runId: string
  jobId: string
  stepId: string
  attempt?: number
  env?: Record<string, string>
  secrets?: Record<string, string>
  artifacts?: ArtifactClient
  events?: RuntimeEvents
  logger: RuntimeLogger // Required - must use platform.logger
  trace?: RuntimeTrace
}

export function createStepContext(
  input: CreateStepContextInput,
): StepContext {
  return {
    runId: input.runId,
    jobId: input.jobId,
    stepId: input.stepId,
    attempt: input.attempt ?? 0,
    env: { ...process.env, ...(input.env ?? {}) } as Record<string, string>,
    secrets: input.secrets ?? {},
    artifacts: input.artifacts,
    events: input.events,
    logger: input.logger, // Use provided logger (platform.logger)
    trace: input.trace,
  }
}





