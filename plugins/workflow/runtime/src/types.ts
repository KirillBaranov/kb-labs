import type { StepSpec } from '@kb-labs/workflow-contracts'
import type { ArtifactClient } from '@kb-labs/workflow-artifacts'
import type { StepState } from '@kb-labs/workflow-constants'
import type {
  PluginContextV3 as PluginContext,
  ExecutionTarget,
} from '@kb-labs/plugin-contracts'

export type { ArtifactClient } from '@kb-labs/workflow-artifacts'

export interface RuntimeLogger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface RuntimeEvents {
  emit(name: string, payload: Record<string, unknown>): Promise<void> | void
}

export interface RuntimeTrace {
  traceId: string
  spanId?: string
  parentSpanId?: string
}

export interface StepContext {
  runId: string
  jobId: string
  stepId: string
  attempt: number
  env: Record<string, string>
  secrets: Record<string, string>
  artifacts?: ArtifactClient
  events?: RuntimeEvents
  logger: RuntimeLogger
  trace?: RuntimeTrace
  pluginContext?: PluginContext
  onLog?: (entry: { level: string; message: string; stream: 'stdout' | 'stderr'; lineNo: number; timestamp: string; meta?: Record<string, unknown> }) => void
}

export interface StepExecutionRequest {
  spec: StepSpec
  context: StepContext
  workspace?: string
  target?: ExecutionTarget
  signal?: AbortSignal
}

export interface StepExecutionSuccess {
  status: Extract<StepState, 'success'>
  outputs?: Record<string, unknown>
}

export interface StepExecutionFailure {
  status: Extract<StepState, 'failed' | 'cancelled'>
  error: {
    message: string
    code?: string
    stack?: string
    details?: Record<string, unknown>
  }
}

export type StepExecutionResult = StepExecutionSuccess | StepExecutionFailure

export interface Runner {
  execute(request: StepExecutionRequest): Promise<StepExecutionResult>
}
