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
import type { ExecutionTarget, ExpressionContext, StepSpec } from '@kb-labs/workflow-contracts';
import type { ExecutionBackend } from '@kb-labs/plugin-execution';
import { createCorrelatedLogger } from '@kb-labs/shared-http';
import {
  interpolateObject,
  interpolateString,
  evaluateExpression,
  resolveValue,
} from '@kb-labs/workflow-contracts';
import type { GateInput, GateRouteAction } from '@kb-labs/workflow-builtins';
import { SandboxRunner } from '@kb-labs/workflow-runtime';

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
        logDiagnosticEvent(jobLogger as unknown as ILogger, {
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

          // Collect outputs from all completed steps (across all jobs)
          if (freshRun) {
            for (const j of freshRun.jobs) {
              for (const s of j.steps) {
                if (s.status === 'success' && s.spec.id) {
                  exprCtx.steps[s.spec.id] = {
                    outputs: (s.outputs ?? {}) as Record<string, unknown>,
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
              jobLogger.info('Step skipped (condition false)', {
                runId: run.id,
                jobId: job.id,
                stepId: step.id,
                condition,
              });
              await engine.markStepCompleted(run.id, job.id, step.id, { skipped: true });
              continue;
            }
          }

          // --- Interpolate spec.with (data flow between steps) ---
          const interpolatedWith = step.spec.with
            ? interpolateObject(step.spec.with as Record<string, unknown>, exprCtx)
            : undefined;

          const stepExecutionId = `wf-${run.id}-${job.id}-${step.id}-${Date.now()}`;
          const stepLogger = jobLogger.child({
            operation: 'workflow.step',
            stepId: step.id,
            attempt: 1,
            executionId: stepExecutionId,
            spanId: stepExecutionId,
            invocationId: stepExecutionId,
          });

          stepLogger.info('Executing step', {
            runId: run.id,
            jobId: job.id,
            stepId: step.id,
            uses: step.spec.uses,
          });

          // --- Handle builtin:approval ---
          if (step.spec.uses === 'builtin:approval') {
            // If step is already waiting (e.g. daemon restarted), skip to polling
            if (step.status !== 'waiting_approval') {
              // Persist interpolated spec.with so REST API shows resolved values
              if (interpolatedWith) {
                const stateStore = engine.getStateStore();
                await stateStore.updateStep(run.id, job.id, step.id, (draft) => {
                  draft.spec = { ...draft.spec, with: interpolatedWith };
                });
              }
              await engine.markStepWaitingApproval(run.id, job.id, step.id);
            }

            stepLogger.info('Waiting for approval', {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
              context: interpolatedWith,
            });

            // Poll until approval is resolved or stop is requested
            while (!stopRequested) {
              await sleep(2000);
              const currentRun = await engine.getRun(run.id);
              const currentJob = currentRun?.jobs.find(j => j.id === job.id);
              const currentStep = currentJob?.steps.find(s => s.id === step.id);

              if (!currentStep || currentStep.status === 'success') {
                stepLogger.info('Approval granted', { runId: run.id, stepId: step.id });
                break;
              }

              if (currentStep.status === 'failed') {
                const rejectMsg = currentStep.error?.message ?? 'Approval rejected';
                stepLogger.info('Approval rejected', { runId: run.id, stepId: step.id });
                throw new Error(rejectMsg);
              }
            }

            if (stopRequested) {
              stepLogger.info('Approval wait interrupted by shutdown', { stepId: step.id });
              return;
            }

            continue; // Outputs already set by resolveApproval
          }

          // --- Handle builtin:gate ---
          if (step.spec.uses === 'builtin:gate') {
            const gateInput = (interpolatedWith ?? {}) as unknown as GateInput;
            const decisionPath = gateInput.decision;
            const maxIterations = gateInput.maxIterations ?? 3;

            // Resolve decision value from expression context
            const decisionValue = resolveValue(decisionPath, exprCtx);
            const decisionKey = String(decisionValue);

            // Find matching route
            const route: GateRouteAction | undefined =
              gateInput.routes[decisionKey] ?? gateInput.routes[decisionValue as string];
            const action = route ?? gateInput.default ?? 'fail';

            stepLogger.info('Gate evaluation', {
              runId: run.id,
              stepId: step.id,
              decision: decisionPath,
              decisionValue,
              action: typeof action === 'string' ? action : 'restart',
            });

            // Track gate iterations in run metadata
            const iterationKey = `gate:${step.spec.id ?? step.id}:iterations`;
            const metadata = (freshRun?.metadata ?? {}) as Record<string, unknown>;
            const currentIteration = (metadata[iterationKey] as number) ?? 0;

            if (action === 'continue') {
              await engine.markStepCompleted(run.id, job.id, step.id, {
                decisionValue,
                action: 'continue',
                iteration: currentIteration,
              });
              continue;
            }

            if (action === 'fail') {
              const error = new Error(`Gate failed: decision=${decisionKey}`);
              await engine.markStepFailed(run.id, job.id, step.id, error, {
                decisionValue,
                action: 'fail',
                iteration: currentIteration,
              });
              throw error;
            }

            // restartFrom action
            const restartAction = action as { restartFrom: string; context?: Record<string, unknown> };
            const nextIteration = currentIteration + 1;

            if (nextIteration >= maxIterations) {
              const error = new Error(
                `Gate max iterations reached (${maxIterations}) for step ${step.spec.id ?? step.id}`
              );
              await engine.markStepFailed(run.id, job.id, step.id, error, {
                decisionValue,
                action: 'fail',
                maxIterationsReached: true,
                iteration: currentIteration,
                maxIterations,
              });
              throw error;
            }

            stepLogger.info('Gate triggering restart', {
              restartFrom: restartAction.restartFrom,
              iteration: nextIteration,
              maxIterations,
            });

            // Mark gate step as completed (with restart info)
            await engine.markStepCompleted(run.id, job.id, step.id, {
              decisionValue,
              action: 'restart',
              restartFrom: restartAction.restartFrom,
              iteration: nextIteration,
            });

            // Update iteration counter in run metadata
            await engine.updateRun(run.id, (draft) => {
              const md = (draft.metadata ?? {}) as Record<string, unknown>;
              md[iterationKey] = nextIteration;
              draft.metadata = md;

              // Merge rework context into trigger.payload
              if (restartAction.context) {
                const payload = (draft.trigger.payload ?? {}) as Record<string, unknown>;
                Object.assign(payload, restartAction.context);
                draft.trigger.payload = payload;
              }

              return draft;
            });

            // Reset steps from target to end of job (set to queued)
            const stateStore = engine.getStateStore();
            const scheduler = engine.getScheduler();
            let foundTarget = false;

            for (const s of job.steps) {
              if (s.spec.id === restartAction.restartFrom || s.id === restartAction.restartFrom) {
                foundTarget = true;
              }
              if (foundTarget) {
                await stateStore.updateStep(run.id, job.id, s.id, (draft) => {
                  draft.status = 'queued';
                  draft.startedAt = undefined;
                  draft.finishedAt = undefined;
                  draft.error = undefined;
                  draft.outputs = undefined;
                });
              }
            }

            // Reset job status and re-enqueue
            await stateStore.updateJob(run.id, job.id, (draft) => {
              draft.status = 'queued';
              draft.startedAt = undefined;
              draft.finishedAt = undefined;
            });

            const updatedRun = await engine.getRun(run.id);
            const updatedJob = updatedRun?.jobs.find(j => j.id === job.id);
            if (updatedJob) {
              await scheduler.enqueueJob(run.id, updatedJob, updatedJob.priority ?? 'normal');
            }

            // Exit processJob — worker will pick up the re-queued job
            return;
          }

          // --- Regular step execution ---
          // Mark step as started (sets startedAt timestamp)
          await engine.markStepStarted(run.id, job.id, step.id);

          // Build spec with interpolated `with`, `run`, and `summary`.
          // Normalize `run: cmd` → `uses: builtin:shell, with: { command: cmd }`
          // Interpolate the run string so ${{ inputs.* }}, ${{ steps.* }} etc. are resolved.
          //
          // StepSpecRaw mirrors the pre-transform StepSpec fields we access dynamically.
          // StepSpec (post-zod-transform) may omit `run` after normalization, so we work
          // with the raw record shape here before re-casting to StepSpec for execution.
          interface StepSpecRaw {
            run?: string;
            uses?: string;
            summary?: string;
            with?: Record<string, unknown>;
            [key: string]: unknown;
          }
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
          const interpolatedSpec = interpolatedWith
            ? { ...baseSpec, with: { ...(baseSpec.with ?? {}), ...interpolatedWith } }
            : baseSpec;

          // Delegate execution to the execution plane.
          // The platform handles provisioning (workspace, environment, cleanup) transparently.
          const result = await runner.execute({
            spec: interpolatedSpec as StepSpec,
            context: {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
              attempt: 1,
              env: freshRun?.env || ({} as Record<string, string>),
              secrets: {} as Record<string, string>, // TODO: map run.secrets array to Record
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
              onLog: (entry) => {
                void engine.publishLog(run.id, job.id, step.id, entry);
              },
            },
            workspace: runWorkspace,
            target,
          });

          if (result.status === 'failed') {
            const error = new Error(result.error?.message ?? 'Step execution failed');

            // Mark step as failed (sets finishedAt timestamp + error)
            await engine.markStepFailed(run.id, job.id, step.id, error);

            stepLogger.error('Step failed', error, {
              runId: run.id,
              jobId: job.id,
              stepId: step.id,
            });
            throw error;
          }

          // Mark step as completed (sets finishedAt timestamp + outputs)
          await engine.markStepCompleted(run.id, job.id, step.id, result.status === 'success' ? result.outputs : undefined);

          stepLogger.info('Step completed', {
            runId: run.id,
            jobId: job.id,
            stepId: step.id,
          });
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

function inferWorkspaceProvisionReasonCode(message: string) {
  return /ETIMEDOUT|timeout/iu.test(message)
    ? 'workspace_provision_timeout'
    : 'workspace_provision_failed';
}
