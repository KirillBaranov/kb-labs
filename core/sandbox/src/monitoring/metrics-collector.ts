/**
 * @module @kb-labs/core-sandbox/monitoring/metrics-collector
 * CPU and Memory metrics collection
 */

import type { ExecMetrics } from '../types/index';

/**
 * Collect execution metrics
 * @param startTime - Start time in milliseconds
 * @param cpuStart - CPU usage at start
 * @param memStart - Memory usage at start (RSS bytes)
 * @returns Execution metrics
 */
export function collectMetrics(
  startTime: number,
  cpuStart: NodeJS.CpuUsage,
  memStart: number
): ExecMetrics {
  const endTime = Date.now();
  const endCpu = process.cpuUsage(cpuStart);
  const cpuMs = (endCpu.user + endCpu.system) / 1000;
  const memMb = (process.memoryUsage().rss - memStart) / 1024 / 1024;

  return {
    timeMs: endTime - startTime,
    cpuMs,
    memMb,
  };
}

