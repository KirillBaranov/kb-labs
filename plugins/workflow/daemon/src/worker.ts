/**
 * @module @kb-labs/workflow-daemon/worker
 * WorkflowWorker implementation - processes jobs from WorkflowEngine.
 *
 * The worker orchestrates job/step execution but delegates all code execution
 * to the execution plane (backend.execute). It knows nothing about containers,
 * environments, or workspace provisioning — that's the platform's responsibility.
 */

import type { WorkflowEngine } from '@kb-labs/workflow-engine';
import type { IEntityRegistry } from '@kb-labs/core-registry';
import { logDiagnosticEvent } from '@kb-labs/core-platform';
import type { ILogger, IAnalytics, IWorkspaceProvider } from '@kb-labs/core-platform';
import type { IExecutionBackend } from '@kb-labs/core-contracts';
import type { ExecutionTarget, ExpressionContext, StepSpec, WorkflowRun, JobRun, StepRun } from '@kb-labs/workflow-contracts';
import type { ExecutionBackend } from '@kb-labs/plugin-execution';
import { createCorrelatedLogger } from '@kb-labs/shared-http';
import {
  interpolateObject,
  interpolateString,
  evaluateExpression,
  coerceToString,
} from '@kb-labs/workflow-contracts';
import type { GateInput } from '@kb-labs/workflow-steps';
import { GateHandler, type GateDecision } from '@kb-labs/workflow-steps';
import { SandboxRunner } from '@kb-labs/workflow-runtime';

interface StepSpecRaw {
  run?: string;
  uses?: string;
  summary?: string;
  with?: Record<string, unknown>;
  [key: string]: unknown;
}

interface Platform {
  readonly executionBackend: IExecutionBackend;
  readonly hasExecutionBackend: boolean;
  getAdapter<T = unknown>(name: string): T | undefined;
}

export interface CreateWorkflowWorkerOptions {
  engine: WorkflowEngine;
  cliApi: IEntityRegistry;
  logger: ILogger;
  platform: Platform;
  workspaceRoot: string;
  concurrency?: number;
  /** Default timeout for step execution (ms). Default: 120000 (2 minutes) */
  defaultTimeout?: number;
  /** Platform analytics adapter (OPTIONAL) */
  analytics?: IAnalytics;
  /**
   * Enable verbose debug logging (inputs, expr context, interpolation details).
   * Defaults to WORKFLOW_DEBUG env var. Pass true to force-enable.
   */
  debugMode?: boolean;
}

export interface WorkflowWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Create a workflow worker that processes jobs from the queue.
 * Uses SandboxRunner with ExecutionBackend for plugin execution.
 *
 * The worker is a pure orchestrator:
 * - Picks jobs from queue, iterates steps sequentially
 * - Delegates execution to backend.execute() (execution plane)
 * - Handles results, marks status, manages retry/failure
 *
 * All provisioning (workspace, environment, cleanup) is handled by the
 * execution plane transparently — the worker doesn't know or care.
 */
export async function createWorkflowWorker(
  options: CreateWorkflowWorkerOptions
): Promise<WorkflowWorker> {
  const {
    engine,
    cliApi,
    logger,
    platform,
    workspaceRoot,
    concurrency = 5,
    defaultTimeout = 120000,
    analytics,
    debugMode = process.env['WORKFLOW_DEBUG'] === 'true',
  } = options;

  let isRunning = false;
  let stopRequested = false;

  // Track running jobs for graceful shutdown
  const runningJobs = new Map<string, Promise<void>>();

  // In-memory lock to prevent duplicate job processing from concurrent worker loops.
  // zrangebyscore+zrem is not atomic, so multiple workers can dequeue the same entry.
  const claimedJobs = new Set<string>();

  // ExecutionBackend from platform — unified across all hosts (CLI, REST API, workflow)
  // In container mode this is a RoutingBackend; in standard mode — in-process/worker-pool.
  const executionBackend = platform.executionBackend;

  // Create SandboxRunner with ExecutionBackend
  const runner = new SandboxRunner({
    // IExecutionBackend<unknown> (core-contracts) is structurally compatible with
    // ExecutionBackend (plugin-execution) — both expose the same execute/health/stats/shutdown API.
    backend: executionBackend as unknown as ExecutionBackend,
    cliApi,
    workspaceRoot,
    defaultTimeout,
  });

  /**
   * Process a single job from the queue.
   */
  async function processJob(): Promise<boolean> {
    const entry = await engine.nextJob();
    if (!entry) {
      return false; // No job available
    }

    // Get run and job from state store using IDs from queue entry
    const run = await engine.getRun(entry.runId);
    if (!run) {
      logger.error('Data inconsistency: Run not found for job entry', undefined, {
        runId: entry.runId,
        jobId: entry.jobId
      });
      return true; // Entry was processed (but run missing - data corruption)
    }

    const job = run.jobs.find(j => j.id === entry.jobId);
    if (!job) {
      logger.error('Data inconsistency: Job not found in run', undefined, {
        runId: run.id,
        jobId: entry.jobId
      });
      return true; // Entry was processed (but job missing - data corruption)
    }

    const jobKey = `${run.id}:${job.id}`;

    // Guard against duplicate processing from concurrent worker loops.
    // zrangebyscore+zrem is not atomic — multiple loops can dequeue the same entry.
    if (claimedJobs.has(jobKey)) {
      return true; // Another loop already claimed this job
    }
    claimedJobs.add(jobKey);

    const waitMs = job.queuedAt ? Date.now() - new Date(job.queuedAt).getTime() : undefined;
    logger.info('Job picked from queue', {
      runId: run.id,
      jobId: job.id,
      jobName: job.jobName,
      queuedAt: job.queuedAt,
      waitMs,
    });

    const jobStartTime = Date.now();
    const jobLogger = createCorrelatedLogger(logger, {
      serviceId: 'workflow',
      logsSource: 'workflow',
      layer: 'workflow',
      service: 'worker',
      requestId: run.id,
      traceId: run.id,
      operation: 'workflow.job',
      bindings: {
        workflowId: run.id,
        runId: run.id,
        jobId: job.id,
        jobName: job.jobName,
      },
    });

    jobLogger.info('Processing job', {
      runId: run.id,
      jobId: job.id,
      jobName: job.jobName,
    });

    // Mark job as started (sets startedAt timestamp)
    await engine.markJobStarted(run.id, job.id);

    // Track job processing started
    analytics?.track('workflow.worker.job.started', {
      runId: run.id,
      jobId: job.id,
      jobName: job.jobName,
      stepCount: job.steps.length,
    }).catch(() => {});

    // Resolve target hint from workflow spec (explicit override for execution plane)
    const runTarget = (run.metadata as Record<string, unknown> | undefined)?.target as ExecutionTarget | undefined;
    const jobTarget = job.target as ExecutionTarget | undefined;
    const target = jobTarget ?? runTarget;

    // ── Workspace provisioning (worktree/container/remote) ──
    // If platform has a workspace provider, create an isolated workspace for this run.
    // All steps will execute in the provisioned workspace instead of the host workspace.
    const wsProvider = platform.getAdapter<IWorkspaceProvider>('workspace');
    // Without a workspace adapter, run steps in the project directory.
    // KB_PROJECT_ROOT is injected by kb-dev; fall back to workspaceRoot (platform dir) only
    // when running outside of kb-dev (e.g. tests or direct node invocation).
    let runWorkspace = wsProvider
      ? workspaceRoot
      : (process.env['KB_PROJECT_ROOT'] ?? workspaceRoot);
    let provisionedWorkspaceId: string | undefined;

    if (wsProvider) {
      const wsId = `wt_${run.id.slice(0, 8)}`;
      try {
        // Deterministic workspaceId per run — retries reuse the same worktree
        const ws = await wsProvider.materialize({
          workspaceId: wsId,
          sourceRef: 'main',
          metadata: { runId: run.id, jobId: job.id },
          onProgress: (event) => {
            jobLogger.info(`[workspace] ${event.stage}: ${event.message}`, {
              stage: event.stage,
              progress: event.progress,
            });
          },
        });
        if (ws.rootPath) {
          runWorkspace = ws.rootPath;
          provisionedWorkspaceId = ws.workspaceId;
          jobLogger.info('Workspace provisioned', {
            workspaceId: ws.workspaceId,
            provider: ws.provider,
            rootPath: ws.rootPath,
          });
        }
      } catch (wsError) {
        const msg = wsError instanceof Error ? wsError.message : String(wsError);
        logDiagnosticEvent(jobLogger, {
          domain: 'workflow',
          event: 'workflow.workspace.provision',
          level: 'error',
          reasonCode: inferWorkspaceProvisionReasonCode(msg),
          message: 'Workspace provisioning failed',
          outcome: 'failed',
          error: wsError instanceof Error ? wsError : new Error(String(wsError)),
          serviceId: 'workflow',
          stage: 'materialize',
          evidence: {
            runId: run.id,
            jobId: job.id,
            workspaceId: wsId,
          },
        });
        const provisionErr = new Error(`Workspace provisioning failed: ${msg}`);
        await engine.markJobFailed(run.id, job.id, provisionErr);
        claimedJobs.delete(jobKey);
        return true;
      }
    }

    // Create job execution promise for graceful shutdown tracking
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Step execution loop: handles data flow, spec.if, builtin:approval polling, builtin:gate routing with restart-from
    const jobPromise = (async () => {
      try {
        // Execute job steps using SandboxRunner
        // IMPORTANT: Steps MUST run sequentially because:
        // - Step outputs are inputs for next steps
        // - Steps may have side effects that depend on order
        // - Workflow semantics require sequential execution
         
        for (const step of job.steps) {
          if (step.status === 'success') {
            continue; // Skip already completed steps
          }

          // --- Build ExpressionContext from fresh run state ---
          const freshRun = await engine.getRun(run.id);
          const exprCtx: ExpressionContext = {
            env: freshRun?.env ?? {},
            trigger: freshRun?.trigger ?? { type: 'manual' },
            inputs: freshRun?.inputs ?? {},
            steps: {},
          };

          // Collect outputs from all completed steps (across all jobs).
          // Failed approval steps also expose their outputs so the following gate
          // can read `outputs.action === 'reject'` and route correctly.
          if (freshRun) {
            for (const j of freshRun.jobs) {
              for (const s of j.steps) {
                if (s.status === 'success' && s.spec.id) {
                  exprCtx.steps[s.spec.id] = {
                    outputs: (s.outputs ?? {}) as Record<string, unknown>,
                  };
                } else if (
                  s.status === 'failed' &&
                  s.spec.uses === 'builtin:approval' &&
                  s.spec.id &&
                  s.outputs
                ) {
                  // Rejected approval — gate needs to see action/comment to route
                  exprCtx.steps[s.spec.id] = {
                    outputs: s.outputs as Record<string, unknown>,
                  };
                }
              }
            }
          }

          // --- Evaluate spec.if (skip step if condition is false) ---
          if (step.spec.if) {
            const condition = step.spec.if;
            // Strip ${{ }} wrapper if present
            const rawExpr = condition.trim().replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
            const shouldRun = evaluateExpression(rawExpr, exprCtx);
            if (!shouldRun) {
              jobLogger.info('[step] Skipped: condition evaluated to false', {
                runId: run.id,
                jobId: job.id,
                stepId: step.id,
                stepName: step.name,
                stepIndex: step.index,
                condition: rawExpr,
                evaluatedContext: {
                  inputs: exprCtx.inputs,
                  steps: exprCtx.steps,
                  env: exprCtx.env,
                },
              });
              await engine.markStepCompleted(run.id, job.id, step.id, { skipped: true });
              continue;
            }
          }

          // Debug: dump expression context (available to all ${{ }} expressions in this step)
          if (debugMode) {
            jobLogger.info('[debug] Expression context for step', {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
              stepUses: step.spec.uses,
              exprCtx: {
                inputs: exprCtx.inputs,
                steps: exprCtx.steps,
                env: exprCtx.env,
              },
            });
          }

          // --- Interpolate spec.with (data flow between steps) ---
          const interpolatedWith = step.spec.with
            ? interpolateObject(step.spec.with as Record<string, unknown>, exprCtx)
            : undefined;

          // --- Interpolate spec.env and forward to shell handler ---
          // step.spec.env values may contain ${{ }} expressions. Interpolate them
          // and pass as with.env so builtin:shell merges them into process.env.
          // coerceToString ensures object/array inputs become valid JSON strings
          // rather than "[object Object]" when assigned to env vars.
          const interpolatedEnvRaw = step.spec.env
            ? interpolateObject(step.spec.env as Record<string, unknown>, exprCtx)
            : undefined;
          const interpolatedEnv: Record<string, string> | undefined = interpolatedEnvRaw
            ? Object.fromEntries(
                Object.entries(interpolatedEnvRaw).map(([k, v]) => [k, coerceToString(v)])
              )
            : undefined;

          // Debug: show raw spec.with vs resolved interpolatedWith
          if (debugMode && step.spec.with) {
            jobLogger.info('[debug] Step input interpolation', {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
              rawWith: step.spec.with,
              resolvedWith: interpolatedWith,
            });
          }

          const stepExecutionId = `wf-${run.id}-${job.id}-${step.id}-${Date.now()}`;
          const stepLogger = jobLogger.child({
            operation: 'workflow.step',
            stepId: step.id,
            stepName: step.name,
            stepIndex: step.index,
            attempt: job.attempt ?? 1,
            executionId: stepExecutionId,
            spanId: stepExecutionId,
            invocationId: stepExecutionId,
          });

          // Persist resolved inputs into step.resolvedInputs — a separate field that
          // does NOT mutate spec.with. This preserves the original ${{ }} templates so
          // gate restartFrom cycles can re-interpolate the step correctly on each pass.
          if (interpolatedWith) {
            const stateStore = engine.getStateStore();
            await stateStore.updateStep(run.id, job.id, step.id, (draft) => {
              draft.resolvedInputs = interpolatedWith;
            });
          }

          stepLogger.info('Executing step', {
            runId: run.id,
            jobId: job.id,
            stepId: step.id,
            uses: step.spec.uses,
            // Log resolved inputs so failures are debuggable without a debug flag.
            // Sensitive values (tokens, secrets) will appear here — acceptable for
            // server-side structured logs; do not surface in public UI.
            inputs: interpolatedWith,
          });

          // --- Handle builtin:approval ---
          if (step.spec.uses === 'builtin:approval') {
            if (step.status === 'failed') {
              // Already rejected (daemon restarted after resolution) — let gate route.
              stepLogger.info('Approval already rejected — skipping to gate', { runId: run.id, stepId: step.id });
              continue;
            }
            if (step.status !== 'waiting_approval') {
              await engine.markStepWaitingApproval(run.id, job.id, step.id);
            }
            const approvalResult = await waitForApproval(
              engine, run.id, job.id, step, interpolatedWith as Record<string, unknown> | undefined,
              () => stopRequested, stepLogger,
            );
            if (approvalResult === 'interrupted') { return; }
            continue; // Outputs already set by resolveApproval
          }

          // --- Handle builtin:gate ---
          if (step.spec.uses === 'builtin:gate') {
            const gateInput = (interpolatedWith ?? {}) as unknown as GateInput;
            // Iteration counter lives in step.metadata so it survives restarts without
            // polluting run.metadata. Runs started before this change lose their counter
            // (reset to 0) — extra iterations are safer than silent skips.
            const currentIteration = (step.metadata?.['iterations'] as number) ?? 0;

            const decision = new GateHandler().handle(gateInput, exprCtx, currentIteration);
            stepLogger.info('[gate] Evaluating gate decision', {
              runId: run.id,
              stepId: step.id,
              stepName: step.name,
              expression: gateInput.decision,
              action: decision.action,
              iteration: currentIteration,
            });

            if (decision.action === 'continue') {
              await engine.markStepCompleted(run.id, job.id, step.id, decision.outputs);
              continue;
            }
            if (decision.action === 'fail') {
              stepLogger.error('[gate] Gate condition failed, aborting job', decision.error, {
                runId: run.id,
                stepId: step.id,
                stepName: step.name,
              });
              await engine.markStepFailed(run.id, job.id, step.id, decision.error, decision.outputs);
              throw decision.error;
            }
            // restart
            await applyGateRestart(engine, run, job, step, decision, stepLogger);
            return;
          }

          // --- Regular step execution ---
          // Mark step as started (sets startedAt timestamp)
          const stepStartTime = Date.now();
          await engine.markStepStarted(run.id, job.id, step.id);

          // Build spec with interpolated `with`, `run`, and `summary`.
          // Normalize `run: cmd` → `uses: builtin:shell, with: { command: cmd }`
          // Interpolate the run string so ${{ inputs.* }}, ${{ steps.* }} etc. are resolved.
          // StepSpec (post-zod-transform) may omit `run` after normalization, so work
          // with the StepSpecRaw shape here before re-casting to StepSpec for execution.
          let baseSpec: StepSpecRaw = step.spec as StepSpecRaw;
          if (baseSpec.run && !baseSpec.uses) {
            const { run: rawRun, with: existingWith, ...rest } = baseSpec;
            const command = typeof rawRun === 'string' ? interpolateString(rawRun, exprCtx) : rawRun;
            baseSpec = { ...rest, uses: 'builtin:shell', with: { ...existingWith, command } };
          }
          // Interpolate the summary field so ${{ inputs.* }} resolves in step descriptions shown in Studio.
          if (typeof baseSpec.summary === 'string') {
            baseSpec.summary = interpolateString(baseSpec.summary, exprCtx);
          }
          // Merge interpolated env into with.env for builtin:shell (ShellInput.env).
          const specWithEnv = interpolatedEnv
            ? { ...baseSpec, with: { ...(baseSpec.with ?? {}), env: { ...(baseSpec.with?.['env'] as Record<string, string> | undefined ?? {}), ...interpolatedEnv } } }
            : baseSpec;
          const interpolatedSpec = interpolatedWith
            ? {
                ...specWithEnv,
                with: {
                  ...(specWithEnv.with ?? {}),
                  ...interpolatedWith,
                  // spec.env (interpolatedEnv) must survive the spread of interpolatedWith.env
                  ...(interpolatedEnv
                    ? { env: { ...(interpolatedWith['env'] as Record<string, string> | undefined ?? {}), ...interpolatedEnv } }
                    : {}),
                },
              }
            : specWithEnv;

          // Delegate execution to the execution plane.
          // The platform handles provisioning (workspace, environment, cleanup) transparently.
          const result = await runner.execute({
            spec: interpolatedSpec as StepSpec,
            context: {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
              attempt: 1,
              env: {
                // KB_PLATFORM_ROOT: where platform code (dist/, node_modules) lives.
                // Shell steps can use this to reference platform commands when the
                // worktree doesn't have compiled dist/ directories.
                KB_PLATFORM_ROOT: workspaceRoot,
                // KB_WORKSPACE_ROOT: the actual execution context (worktree or project dir).
                KB_WORKSPACE_ROOT: runWorkspace,
                ...(freshRun?.env || {}),
              },
              // Secrets resolution not yet implemented: run.secrets contains names only.
              // When a platform secrets store is available, resolve names → values here.
              secrets: ((): Record<string, string> => {
                const names = freshRun?.secrets ?? []
                if (names.length > 0) {
                  stepLogger.warn('Step declares secrets but secret resolution is not implemented', { secrets: names })
                }
                return {}
              })(),
              logger: {
                debug: (message: string, meta?: Record<string, unknown>) => stepLogger.debug(message, meta),
                info: (message: string, meta?: Record<string, unknown>) => stepLogger.info(message, meta),
                warn: (message: string, meta?: Record<string, unknown>) => stepLogger.warn(message, meta),
                error: (message: string, meta?: Record<string, unknown>) => stepLogger.error(message, undefined, meta),
              },
              trace: {
                traceId: run.id,
                spanId: stepExecutionId,
                parentSpanId: job.id,
              },
              // stepLogger as loggerOverride: ctx.logger.* in the plugin will use stepLogger
              // as its base, writing to SQLite with runId/jobId/stepId context.
              // See: plugins/workflow/docs/adr/0019-log-stream-separation.md
              loggerOverride: stepLogger,
              // ui/shell log entries: persist to SQLite with workflow context + publish for SSE.
              // See: plugins/workflow/docs/adr/0019-log-stream-separation.md
              onLog: (entry) => {
                stepLogger.info(entry.message, {
                  stream: entry.stream,
                  lineNo: entry.lineNo,
                  logSource: entry.stream === 'stderr' ? 'stderr' : 'stdout',
                });
                void engine.publishLog(run.id, job.id, step.id, entry);
              },
              // ctx.logger.* entries: stepLogger base already wrote to SQLite. Only publish for SSE.
              // See: plugins/workflow/docs/adr/0019-log-stream-separation.md
              onLoggerLog: (entry) => {
                void engine.publishLog(run.id, job.id, step.id, entry);
              },
            },
            workspace: runWorkspace,
            target,
          });

          if (result.status === 'failed') {
            const stepDurationMs = Date.now() - stepStartTime;
            const error = new Error(result.error?.message ?? 'Step execution failed');

            // Mark step as failed (sets finishedAt timestamp + error)
            await engine.markStepFailed(run.id, job.id, step.id, error);

            stepLogger.error('Step failed', error, {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
              stepName: step.name,
              uses: step.spec.uses,
              durationMs: stepDurationMs,
              resolvedInputs: interpolatedWith,
              errorCode: result.error?.code,
            });

            if (step.continueOnError) {
              stepLogger.warn('[step] continueOnError=true — continuing despite failure', {
                runId: run.id,
                jobId: job.id,
                stepId: step.id,
              });
              continue;
            }
            throw error;
          }

          const stepOutputs = result.status === 'success' ? result.outputs : undefined;

          // Mark step as completed (sets finishedAt timestamp + outputs)
          await engine.markStepCompleted(run.id, job.id, step.id, stepOutputs);

          stepLogger.info('Step completed', {
            runId: run.id,
            jobId: job.id,
            stepId: step.id,
          });

          // Debug: show what outputs are now available to downstream steps
          if (debugMode && stepOutputs) {
            stepLogger.info('[debug] Step outputs', {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
              outputs: stepOutputs,
            });
          }
        }
         

        // Mark job as completed
        await engine.markJobCompleted(run.id, job.id);

        const jobDuration = Date.now() - jobStartTime;
        jobLogger.info('Job completed successfully', {
          runId: run.id,
          jobId: job.id,
        });

        // Track job processing completed
        analytics?.track('workflow.worker.job.completed', {
          runId: run.id,
          jobId: job.id,
          jobName: job.jobName,
          durationMs: jobDuration,
          stepCount: job.steps.length,
        }).catch(() => {});

        // Release workspace on success (cleanup worktree)
        if (provisionedWorkspaceId && wsProvider) {
          try {
            await wsProvider.release(provisionedWorkspaceId);
            jobLogger.info('Workspace released', { workspaceId: provisionedWorkspaceId });
          } catch (releaseErr) {
            jobLogger.warn('Workspace release failed', {
              workspaceId: provisionedWorkspaceId,
              error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
            });
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const jobDuration = Date.now() - jobStartTime;

        await engine.markJobFailed(run.id, job.id, err);

        // Track job processing failed
        analytics?.track('workflow.worker.job.failed', {
          runId: run.id,
          jobId: job.id,
          jobName: job.jobName,
          errorMessage: err.message,
          durationMs: jobDuration,
        }).catch(() => {});

        // Keep workspace on failure for debugging
        if (provisionedWorkspaceId) {
          jobLogger.warn('Workspace kept for debugging', {
            workspaceId: provisionedWorkspaceId,
            path: runWorkspace,
          });
        }
      } finally {
        // Remove from tracking
        runningJobs.delete(jobKey);
        claimedJobs.delete(jobKey);
      }
    })();

    // Track running job
    runningJobs.set(jobKey, jobPromise);

    // Wait for completion
    await jobPromise;

    return true;
  }

  /**
   * Worker loop - continuously processes jobs from the queue.
   */
  async function workerLoop(): Promise<void> {
    // IMPORTANT: This is a polling loop, must run sequentially
     
    while (isRunning && !stopRequested) {
      try {
        const processed = await processJob();

        if (!processed) {
          // No job available, wait before polling again
          await sleep(1000);
        }
      } catch (error) {
        logDiagnosticEvent(logger, {
          domain: 'workflow',
          event: 'workflow.worker.loop',
          level: 'error',
          reasonCode: 'worker_loop_error',
          message: 'Worker loop error',
          outcome: 'failed',
          error: error instanceof Error ? error : new Error(String(error)),
          serviceId: 'workflow',
          evidence: {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
        });
        await sleep(5000); // Wait longer on error
      }
    }
     

    logger.info('Worker loop stopped');
  }

  return {
    async start() {
      if (isRunning) {
        logger.warn('Worker already running');
        return;
      }

      logger.info('Starting workflow worker', { concurrency });
      isRunning = true;
      stopRequested = false;

      // Track worker start
      analytics?.track('workflow.worker.started', {
        concurrency,
      }).catch(() => {});

      // Start multiple worker loops for concurrency
      const promises: Promise<void>[] = [];
      for (let i = 0; i < concurrency; i++) {
        promises.push(workerLoop());
      }

      await Promise.all(promises);
    },

    async stop() {
      if (!isRunning) {
        return;
      }

      logger.info('Stopping workflow worker', {
        runningJobsCount: runningJobs.size,
      });

      // Signal stop
      stopRequested = true;
      isRunning = false;

      // Wait for in-flight jobs to complete (graceful shutdown)
      if (runningJobs.size > 0) {
        logger.info('Waiting for in-flight jobs to complete', {
          count: runningJobs.size,
        });

        const shutdownTimeoutMs = parseInt(
          process.env.WORKFLOW_SHUTDOWN_TIMEOUT_MS || '120000',
          10
        );

        try {
          // Wait for all running jobs with timeout
          await Promise.race([
            Promise.all(Array.from(runningJobs.values())),
            sleep(shutdownTimeoutMs),
          ]);

          if (runningJobs.size > 0) {
            logger.warn('Shutdown timeout reached, marking jobs as interrupted', {
              count: runningJobs.size,
            });

            // Mark unfinished jobs as interrupted (parallel for speed)
            await Promise.all(
              Array.from(runningJobs.keys()).map(async (jobKey) => {
                const [runId, jobId] = jobKey.split(':');
                if (runId && jobId) {
                  await engine.markJobInterrupted(runId, jobId);
                }
              })
            );
          } else {
            logger.info('All in-flight jobs completed gracefully');
          }
        } catch (error) {
          logger.error('Error during graceful shutdown', error instanceof Error ? error : undefined, {
            runningJobsCount: runningJobs.size,
          });
        }
      }

      logger.info('Workflow worker stopped');

      // Track worker stop
      analytics?.track('workflow.worker.stopped', {
        gracefulShutdown: runningJobs.size === 0,
        interruptedJobs: runningJobs.size,
      }).catch(() => {});
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * Poll until an approval step is resolved or a stop signal is received.
 * Returns 'done' when the approval is granted or rejected, 'interrupted' on shutdown.
 */
async function waitForApproval(
  engine: WorkflowEngine,
  runId: string,
  jobId: string,
  step: Pick<StepRun, 'id' | 'name'>,
  interpolatedWith: Record<string, unknown> | undefined,
  isStopRequested: () => boolean,
  stepLogger: ILogger,
): Promise<'done' | 'interrupted'> {
  const approvalTimeoutMs = interpolatedWith?.['timeoutMs'];
  if (!approvalTimeoutMs) {
    stepLogger.warn('[approval] No timeout configured — approval may wait indefinitely', {
      runId,
      jobId,
      stepId: step.id,
      stepName: step.name,
    });
  }

  stepLogger.info('[approval] Waiting for approval', {
    runId,
    jobId,
    stepId: step.id,
    stepName: step.name,
    context: interpolatedWith,
  });

  const approvalStartMs = Date.now();
  let pollCount = 0;

  while (!isStopRequested()) {
    await sleep(2000);
    pollCount++;
    const currentRun = await engine.getRun(runId);
    const currentJob = currentRun?.jobs.find(j => j.id === jobId);
    const currentStep = currentJob?.steps.find(s => s.id === step.id);

    if (!currentStep || currentStep.status === 'success') {
      stepLogger.info('[approval] Approval granted', {
        runId,
        stepId: step.id,
        stepName: step.name,
        waitedMs: Date.now() - approvalStartMs,
      });
      break;
    }

    if (currentStep.status === 'failed') {
      // Approval was rejected — break so the following builtin:gate step can route.
      stepLogger.info('[approval] Approval rejected', {
        runId,
        stepId: step.id,
        stepName: step.name,
        waitedMs: Date.now() - approvalStartMs,
      });
      break;
    }

    if (pollCount % 10 === 0) {
      stepLogger.info('[approval] Still waiting for approval', {
        runId,
        stepId: step.id,
        stepName: step.name,
        waitedMs: Date.now() - approvalStartMs,
        pollCount,
      });
    }
  }

  if (isStopRequested()) {
    stepLogger.info('Approval wait interrupted by shutdown', { stepId: step.id });
    return 'interrupted';
  }
  return 'done';
}

type GateRestartDecision = Extract<GateDecision, { action: 'restart' }>;

/**
 * Apply gate restart: persist iteration counter to step.metadata, reset steps to queued, re-enqueue job.
 * Called when GateHandler returns action='restart'.
 */
async function applyGateRestart(
  engine: WorkflowEngine,
  run: WorkflowRun,
  job: JobRun,
  step: Pick<StepRun, 'id' | 'name'>,
  decision: GateRestartDecision,
  stepLogger: ILogger,
): Promise<void> {
  const { restartFrom, context, outputs, nextIteration } = decision;

  // Collect steps that will be reset for logging
  const stepsToReset: string[] = [];
  for (const s of job.steps) {
    if (s.spec.id === restartFrom || s.id === restartFrom) {
      stepsToReset.push(s.name ?? s.id);
    } else if (stepsToReset.length > 0) {
      stepsToReset.push(s.name ?? s.id);
    }
  }

  stepLogger.warn('[gate] Gate triggered restart', {
    runId: run.id,
    stepId: step.id,
    stepName: step.name,
    restartFrom,
    iteration: nextIteration,
    stepsToReset,
  });

  await engine.markStepCompleted(run.id, job.id, step.id, outputs);

  // Persist iteration counter in step.metadata (survives step reset, avoids polluting run.metadata).
  const stateStore = engine.getStateStore();
  await stateStore.updateStep(run.id, job.id, step.id, (draft) => {
    draft.metadata = { ...(draft.metadata ?? {}), iterations: nextIteration };
  });

  // Merge rework context into run trigger.payload (if provided)
  if (context) {
    await engine.updateRun(run.id, (draft) => {
      const payload = (draft.trigger.payload ?? {}) as Record<string, unknown>;
      Object.assign(payload, context);
      draft.trigger.payload = payload;
      return draft;
    });
  }

  const scheduler = engine.getScheduler();
  let foundTarget = false;

  for (const s of job.steps) {
    if (s.spec.id === restartFrom || s.id === restartFrom) {
      foundTarget = true;
    }
    if (foundTarget) {
      stepLogger.debug('[gate] Reset step to queued', { stepId: s.id, stepName: s.name });
      await stateStore.updateStep(run.id, job.id, s.id, (draft) => {
        draft.status = 'queued';
        draft.startedAt = undefined;
        draft.finishedAt = undefined;
        draft.error = undefined;
        draft.outputs = undefined;
      });
    }
  }

  await stateStore.updateJob(run.id, job.id, (draft) => {
    draft.status = 'queued';
    draft.startedAt = undefined;
    draft.finishedAt = undefined;
  });

  const updatedRun = await engine.getRun(run.id);
  const updatedJob = updatedRun?.jobs.find(j => j.id === job.id);
  if (updatedJob) {
    await scheduler.enqueueJob(run.id, updatedJob, updatedJob.priority ?? 'normal');
    stepLogger.info('[gate] Job re-enqueued for restart', {
      runId: run.id,
      jobId: job.id,
      jobName: job.jobName,
      iteration: nextIteration,
      restartFrom,
    });
  }
}

function inferWorkspaceProvisionReasonCode(message: string) {
  return /ETIMEDOUT|timeout/iu.test(message)
    ? 'workspace_provision_timeout'
    : 'workspace_provision_failed';
}
