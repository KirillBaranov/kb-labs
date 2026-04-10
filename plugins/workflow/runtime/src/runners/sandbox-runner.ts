/**
 * @module @kb-labs/workflow-runtime/runners/sandbox-runner
 *
 * V3 SandboxRunner - executes plugin handlers using platform ExecutionBackend.
 *
 * This runner is for steps that specify `uses: "plugin:..."` or `uses: "command:..."`.
 * It delegates execution to the platform's unified ExecutionBackend instead of
 * implementing custom plugin execution logic.
 *
 * ## Integration Pattern (REST API-style)
 *
 * Instead of resolving plugins inline inside the runner, we:
 * 1. Accept ExecutionBackend from platform (via options)
 * 2. Build ExecutionRequest with PluginContextDescriptor
 * 3. Call backend.execute() - platform handles the rest
 *
 * This matches the REST API pattern where execution is delegated to the platform layer.
 *
 * @example
 * ```typescript
 * const runner = new SandboxRunner({
 *   backend: platform.executionBackend,
 *   cliApi, // For plugin resolution
 * });
 *
 * const result = await runner.execute({
 *   spec: { uses: 'plugin:release-manager/create-release', with: { version: '1.0.0' } },
 *   context: stepContext,
 * });
 * ```
 */

import { randomUUID } from 'node:crypto'
import type { StepSpec } from '@kb-labs/workflow-contracts'
import type {
  ExecutionBackend,
  ExecutionRequest,
  PluginContextDescriptor,
  HostContext,
} from '@kb-labs/plugin-execution'
import type { PermissionSpec } from '@kb-labs/plugin-contracts'
import { getHandlerPermissions } from '@kb-labs/plugin-contracts'
import type { IEntityRegistry } from '@kb-labs/core-registry'
import type {
  Runner,
  StepExecutionRequest,
  StepExecutionResult,
} from '../types'
import { toWorkflowOutputs } from './output-normalizer.js'
import type { IAnalytics, ILogger } from '@kb-labs/core-platform'

export interface SandboxRunnerOptions {
  /**
   * Platform ExecutionBackend (REQUIRED).
   * Obtained from platform.executionBackend.
   */
  backend: ExecutionBackend

  /**
   * CLI API for plugin resolution (REQUIRED).
   * Needed to resolve plugin IDs to plugin roots and handler paths.
   */
  cliApi: IEntityRegistry

  /**
   * Workspace root directory.
   * Default: process.cwd()
   */
  workspaceRoot?: string

  /**
   * Default timeout for plugin execution (ms).
   * Default: 120000 (2 minutes)
   */
  defaultTimeout?: number

  /**
   * Platform analytics adapter (OPTIONAL)
   */
  analytics?: IAnalytics
}

interface PluginCommandResolution {
  pluginId: string
  pluginVersion: string
  pluginRoot: string
  handler: string
  input: unknown
  permissions: PermissionSpec
  configSection?: string
}

/**
 * SandboxRunner - V3 implementation using platform ExecutionBackend.
 *
 * Executes plugin handlers through the unified execution layer.
 * Supports both `uses: "plugin:id/handler"` and `uses: "command:name"` syntax.
 */
export class SandboxRunner implements Runner {
  private readonly backend: ExecutionBackend
  private readonly cliApi: IEntityRegistry
  private readonly workspaceRoot: string
  private readonly defaultTimeout: number
  private readonly analytics?: IAnalytics
  private readonly logger?: ILogger

  constructor(options: SandboxRunnerOptions) {
    this.backend = options.backend
    this.cliApi = options.cliApi
    this.workspaceRoot = options.workspaceRoot ?? process.cwd()
    this.defaultTimeout = options.defaultTimeout ?? 120000 // 2 minutes
    this.analytics = options.analytics
  }

  async execute(request: StepExecutionRequest): Promise<StepExecutionResult> {
    const { spec, context, signal } = request
    const startTime = Date.now()

    // Early validation
    if (signal?.aborted) {
      return buildCancelledResult(signal)
    }

    if (!spec.uses) {
      return this.buildValidationError(context, 'Sandbox runner requires "uses" field to specify plugin handler')
    }

    // Resolve plugin handler
    const resolution = await this.tryResolveCommand(spec, request, context)
    if (!resolution.ok) {
      return resolution.error
    }

    // Execute plugin via backend
    const executionRequest = this.buildExecutionRequest(resolution.value, request, context)

    context.logger.info('Executing plugin handler', {
      stepId: context.stepId,
      pluginId: resolution.value.pluginId,
      handler: resolution.value.handler,
      executionId: executionRequest.executionId,
    })

    // Track plugin execution started
    this.analytics?.track('workflow.sandbox.execution.started', {
      stepId: context.stepId,
      pluginId: resolution.value.pluginId,
      handler: resolution.value.handler,
      uses: spec.uses,
    }).catch(() => {})

    const result = await this.backend.execute(executionRequest, { signal, onLog: context.onLog })
    const duration = Date.now() - startTime

    // Track plugin execution result
    if (result.ok) {
      this.analytics?.track('workflow.sandbox.execution.completed', {
        stepId: context.stepId,
        pluginId: resolution.value.pluginId,
        handler: resolution.value.handler,
        durationMs: duration,
      }).catch(() => {})
    } else {
      this.analytics?.track('workflow.sandbox.execution.failed', {
        stepId: context.stepId,
        pluginId: resolution.value.pluginId,
        handler: resolution.value.handler,
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
        durationMs: duration,
      }).catch(() => {})
    }

    // Map backend result to step result
    return this.mapExecutionResult(result, executionRequest.executionId, context, signal)
  }

  /**
   * Validate step spec and build error result if invalid
   */
  private buildValidationError(context: StepExecutionRequest['context'], message: string): StepExecutionResult {
    context.logger.error('SandboxRunner validation failed', { stepId: context.stepId, message })
    return {
      status: 'failed',
      error: { message, code: 'INVALID_STEP' },
    }
  }

  /**
   * Try to resolve command, returning result wrapper
   */
  private async tryResolveCommand(
    spec: StepSpec,
    request: StepExecutionRequest,
    context: StepExecutionRequest['context']
  ): Promise<{ ok: true; value: PluginCommandResolution } | { ok: false; error: StepExecutionResult }> {
    try {
      const resolution = await this.resolveCommand(spec, request)
      return { ok: true, value: resolution }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resolve plugin command'
      context.logger.error('Plugin command resolution failed', {
        stepId: context.stepId,
        uses: spec.uses,
        error: message,
      })
      return {
        ok: false,
        error: {
          status: 'failed',
          error: { message, code: 'COMMAND_RESOLUTION_FAILED' },
        },
      }
    }
  }

  /**
   * Build ExecutionRequest from resolved command
   */
  private buildExecutionRequest(
    resolution: PluginCommandResolution,
    request: StepExecutionRequest,
    context: StepExecutionRequest['context']
  ): ExecutionRequest {
    const requestId = context.trace?.traceId ?? randomUUID()
    const traceId = context.trace?.traceId ?? requestId
    const executionId = `exec_${context.stepId}_${Date.now()}_${randomUUID().slice(0, 8)}`
    const spanId = executionId
    const invocationId = executionId

    const hostContext: HostContext = {
      host: 'workflow',
      workflowId: context.runId,
      runId: context.runId,
      jobId: context.jobId,
      stepId: context.stepId,
      attempt: context.attempt,
      input: resolution.input,
    }

    const descriptor: PluginContextDescriptor = {
      hostType: 'workflow',
      pluginId: resolution.pluginId,
      pluginVersion: resolution.pluginVersion,
      requestId,
      permissions: resolution.permissions,
      hostContext,
      configSection: resolution.configSection, // For useConfig() auto-detection
    }
    Object.assign(descriptor as unknown as Record<string, unknown>, {
      traceId,
      spanId,
      invocationId,
      executionId,
    })

    return {
      executionId,
      descriptor,
      pluginRoot: resolution.pluginRoot,
      handlerRef: resolution.handler,
      input: resolution.input,
      workspace: request.workspace
        ? {
            type: 'local',
            cwd: request.workspace,
          }
        : undefined,
      timeoutMs: resolution.permissions.quotas?.timeoutMs ?? this.defaultTimeout,
      target: request.target,
    }
  }

  /**
   * Map ExecutionResult to StepExecutionResult
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Result mapping logic: handles success/failure/cancelled states, conditional stdout/stderr logging, debug metadata extraction, and error code translation
  private mapExecutionResult(
    result: Awaited<ReturnType<ExecutionBackend['execute']>>,
    executionId: string,
    context: StepExecutionRequest['context'],
    signal?: AbortSignal
  ): StepExecutionResult {
    if (result.ok) {
      // Include stdout/stderr in completion log if present
      const data = result.data as any;

      // DEBUG: Log what we received
      context.logger.debug('mapExecutionResult received data', {
        stepId: context.stepId,
        executionId,
        dataType: typeof data,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
        hasStdout: !!(data && typeof data === 'object' && data.stdout),
        hasStderr: !!(data && typeof data === 'object' && data.stderr),
      });

      const logMeta: Record<string, unknown> = {
        stepId: context.stepId,
        executionId,
        executionTimeMs: result.executionTimeMs,
      };

      // Add stdout/stderr to log metadata if available
      if (data && typeof data === 'object') {
        if (data.stdout) {logMeta.stdout = data.stdout;}
        if (data.stderr) {logMeta.stderr = data.stderr;}
        if (data.exitCode !== undefined) {logMeta.exitCode = data.exitCode;}
      }

      context.logger.info('Plugin handler completed', logMeta);

      // If handler returned ok: false in its output data, treat as step failure.
      // This covers shell steps that return {ok: false, exitCode: N} without throwing.
      if (data && typeof data === 'object' && data.ok === false) {
        const message = data.stderr
          ? String(data.stderr).slice(0, 500)
          : `Step handler reported failure (exitCode: ${data.exitCode ?? 'unknown'})`;
        context.logger.error('Plugin handler reported failure via ok:false', {
          stepId: context.stepId,
          exitCode: data.exitCode,
          stderr: data.stderr,
        });
        return {
          status: 'failed',
          error: {
            message,
            code: 'HANDLER_REPORTED_FAILURE',
          },
        }
      }

      return {
        status: 'success',
        outputs: toWorkflowOutputs(result.data),
      }
    }

    // Check if cancelled
    if (signal?.aborted || result.error?.code === 'ABORTED') {
      return buildCancelledResult(signal, result.error)
    }

    // Handle failure
    context.logger.error('Plugin handler failed', {
      stepId: context.stepId,
      executionId,
      error: result.error?.message,
      code: result.error?.code,
    })

    return {
      status: 'failed',
      error: {
        message: result.error?.message ?? 'Plugin execution failed',
        code: result.error?.code ?? 'UNKNOWN_ERROR',
        stack: result.error?.stack,
        details: result.error?.details,
      },
    }
  }

  /**
   * Resolve command reference to plugin handler.
   *
   * Supports three formats:
   * - `plugin:id/handler` - workflow handler (native)
   * - `command:name` - CLI command (via adapter)
   * - `builtin:shell` - built-in shell execution
   */
  private async resolveCommand(
    spec: StepSpec,
    request: StepExecutionRequest,
  ): Promise<PluginCommandResolution> {
    const uses = spec.uses!
    const input = spec.with ?? {}

    if (uses.startsWith('plugin:')) {
      return this.resolvePluginHandler(uses, input)
    }

    if (uses.startsWith('command:')) {
      return this.resolveCLICommand(uses, input, request)
    }

    if (uses === 'builtin:shell') {
      return this.resolveBuiltinShell(spec)
    }

    if (uses === 'builtin:approval' || uses === 'builtin:gate') {
      throw new Error(`${uses} is handled by the workflow worker, not the sandbox runner`)
    }

    throw new Error(`Unsupported uses format: ${uses}. Expected "plugin:...", "command:...", or "builtin:shell"`)
  }

  /**
   * Resolve plugin handler reference.
   * Format: `plugin:id/handler` or `plugin:id/path/to/handler`
   */
  private async resolvePluginHandler(
    uses: string,
    input: unknown,
  ): Promise<PluginCommandResolution> {
    const pluginRef = uses.slice('plugin:'.length)
    const [pluginId, ...handlerParts] = pluginRef.split('/')

    if (!pluginId || handlerParts.length === 0) {
      throw new Error(`Invalid plugin reference: ${uses}. Expected "plugin:id/handler"`)
    }

    const handlerName = handlerParts.join('/')

    // Get plugin manifest from CLI API snapshot
    const snapshot = this.cliApi.snapshot()
    // Match by exact pluginId or by short name (e.g. "quality" matches "@kb-labs/quality")
    const entry = snapshot.manifests?.find((m) =>
      m.pluginId === pluginId || m.pluginId.endsWith(`/${pluginId}`)
    )

    if (!entry) {
      throw new Error(`Plugin not found: ${pluginId}`)
    }

    // Find workflow handler by name
    const workflowHandlers = entry.manifest.workflows?.handlers ?? []
    const handler = workflowHandlers.find((h: { id: string }) => h.id === handlerName)

    if (!handler) {
      throw new Error(`Workflow handler not found: ${handlerName} in plugin ${pluginId}`)
    }

    return {
      pluginId,
      pluginVersion: entry.manifest.version,
      pluginRoot: entry.pluginRoot,
      handler: handler.handler, // File path from manifest
      input,
      permissions: getHandlerPermissions(entry.manifest, 'workflow', handlerName),
    }
  }

  /**
   * Resolve CLI command to plugin handler (with adapter).
   *
   * Format: `command:name` (e.g., `command:mind:rag-index`)
   *
   * This uses the CLI Adapter pattern to make CLI commands work in workflow context:
   * - Searches for CLI command in plugin manifests
   * - Wraps workflow input in CLI-compatible format { argv, flags, cwd }
   * - Allows reusing existing CLI commands without writing workflow handlers
   */
  private async resolveCLICommand(
    uses: string,
    input: unknown,
    request: StepExecutionRequest,
  ): Promise<PluginCommandResolution> {
    const commandName = uses.slice('command:'.length)
    const snapshot = this.cliApi.snapshot()

    // Find CLI command in manifests
    for (const entry of snapshot.manifests ?? []) {
      const commands = entry.manifest.cli?.commands ?? []
      const command = commands.find((c: { id: string }) => c.id === commandName)

      if (command) {
        return {
          pluginId: entry.pluginId,
          pluginVersion: entry.manifest.version,
          pluginRoot: entry.pluginRoot,
          handler: command.handler,
          input: this.adaptToCLIFormat(input, request), // CLI Adapter
          permissions: getHandlerPermissions(entry.manifest, 'cli', commandName),
          configSection: entry.manifest.configSection, // For useConfig() auto-detection
        }
      }
    }

    throw new Error(`CLI command not found: ${commandName}`)
  }

  /**
   * CLI Adapter: Convert workflow input to CLI-compatible format.
   *
   * Transforms:
   *   { scope: "default", incremental: true }
   * Into:
   *   { argv: [], flags: { scope: "default", incremental: true }, cwd: "/workspace" }
   *
   * This allows CLI commands to work in workflow context without modification.
   */
  private adaptToCLIFormat(input: unknown, request: StepExecutionRequest): unknown {
    // Pass through if already in CLI format
    if (input && typeof input === 'object' && ('argv' in input || 'flags' in input)) {
      return input
    }

    // Adapt workflow input to CLI format
    return {
      argv: [],
      flags: input || {},
      cwd: request.workspace || this.workspaceRoot,
    }
  }

  /**
   * Resolve builtin:shell to built-in shell handler.
   *
   * Returns a resolution pointing to the builtin-handlers/shell.js file
   * that will be executed through ExecutionBackend.
   */
  private async resolveBuiltinShell(
    spec: StepSpec,
  ): Promise<PluginCommandResolution> {
    // Use import.meta.resolve to find @kb-labs/workflow-builtins package
    // This supports ES module exports properly
    const builtinsUrl = await import.meta.resolve('@kb-labs/workflow-builtins')
    // Convert file:// URL to path and remove /dist/index.js to get package root
    const builtinsPath = builtinsUrl.replace('file://', '').replace('/dist/index.js', '')

    // Extract command from spec.with
    const withBlock = (spec.with ?? {}) as Record<string, unknown>
    const command = withBlock.command ?? withBlock.run ?? withBlock.script

    if (typeof command !== 'string') {
      throw new Error(
        'builtin:shell requires "with.command" (or with.run/with.script) to be a string',
      )
    }

    // Build shell handler input
    const shellInput = {
      command,
      env: typeof withBlock.env === 'object' ? (withBlock.env as Record<string, string>) : undefined,
      timeout: typeof withBlock.timeout === 'number' ? withBlock.timeout : undefined,
      throwOnError: typeof withBlock.throwOnError === 'boolean' ? withBlock.throwOnError : false,
    }

    return {
      pluginId: '@kb-labs/workflow-builtins',
      pluginVersion: '0.1.0',
      pluginRoot: builtinsPath,
      handler: 'dist/shell.js', // Relative path from pluginRoot
      input: shellInput,
      permissions: {
        shell: { allow: ['*'] }, // builtin:shell needs shell access by definition
      },
    }
  }
}

function buildCancelledResult(
  signal?: AbortSignal,
  error?: { message: string },
): StepExecutionResult {
  const reason = error?.message ?? signalReason(signal) ?? 'Step execution cancelled'

  return {
    status: 'cancelled',
    error: {
      message: reason,
      code: 'STEP_CANCELLED',
    },
  }
}

function signalReason(signal?: AbortSignal): string | undefined {
  if (!signal?.aborted) {
    return undefined
  }
  const reason = (signal as AbortSignal & { reason?: unknown }).reason
  if (reason instanceof Error) {
    return reason.message
  }
  if (typeof reason === 'string') {
    return reason
  }
  return undefined
}
