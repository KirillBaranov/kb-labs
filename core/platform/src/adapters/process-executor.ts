/** Platform-internal governed process execution contract. */

export type ProcessTerminationReason =
  | 'completed' | 'timeout' | 'cancelled' | 'memory_limit'
  | 'cpu_limit' | 'process_limit' | 'output_limit' | 'shutdown';

export interface ProcessExecutionIdentity {
  executionId: string;
  requestId: string;
  pluginId: string;
  handlerId?: string;
  tenantId?: string;
}

export interface ProcessLimits {
  timeoutMs: number;
  maxConcurrent?: number;
  cpuMs?: number;
  memoryMb?: number;
  maxProcesses?: number;
  maxOutputBytes?: number;
  graceMs?: number;
}

export interface ProcessRetryPolicy {
  maxAttempts: number;
  idempotent?: boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
}

export interface GovernedProcessRequest {
  processId?: string;
  identity: ProcessExecutionIdentity;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  limits: ProcessLimits;
  signal?: AbortSignal;
  retry?: ProcessRetryPolicy;
}

export interface ProcessUsage {
  wallTimeMs: number;
  cpuMs: number;
  peakMemoryMb: number;
  processCount: number;
  stdoutBytes: number;
  stderrBytes: number;
}

export interface ProcessResult {
  processId: string;
  code: number | null;
  signal?: string;
  stdout: string;
  stderr: string;
  ok: boolean;
  terminationReason: ProcessTerminationReason;
  usage: ProcessUsage;
  attempts: number;
}

export interface ProcessBackendCapabilities {
  platform: 'darwin' | 'linux' | 'other';
  processGroups: boolean;
  hardMemoryLimit: boolean;
  hardCpuLimit: boolean;
  processTreeAccounting: boolean;
  maxProcesses: boolean;
}

export interface IProcessExecutor {
  capabilities(): ProcessBackendCapabilities;
  execute(request: GovernedProcessRequest): Promise<ProcessResult>;
  cancel(processId: string, reason?: 'cancelled' | 'shutdown'): Promise<void>;
  shutdown(): Promise<void>;
}
