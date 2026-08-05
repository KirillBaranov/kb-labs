import type { ProcessBackendCapabilities } from '@kb-labs/core-platform/adapters';
import { accessSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, constants } from 'node:fs';
import { join } from 'node:path';
import type { GovernedProcessRequest } from '@kb-labs/core-platform/adapters';
import { NodeProcessBackend } from './node-backend.js';

export class LinuxProcessBackend extends NodeProcessBackend {
  private readonly cgroupRoot = '/sys/fs/cgroup';

  private cgroupAvailable(): boolean {
    try {
      return existsSync(join(this.cgroupRoot, 'cgroup.controllers')) &&
        existsSync(join(this.cgroupRoot, 'cgroup.procs')) &&
        accessSync(this.cgroupRoot, constants.W_OK) === undefined;
    } catch { return false; }
  }

  override capabilities(): ProcessBackendCapabilities {
    const cgroup = this.cgroupAvailable();
    return { platform: 'linux', processGroups: true, hardMemoryLimit: cgroup, hardCpuLimit: false, processTreeAccounting: true, maxProcesses: cgroup };
  }

  protected override configureProcess(pid: number, request: GovernedProcessRequest): () => void {
    if (!this.cgroupAvailable()) { return () => {}; }
    const group = join(this.cgroupRoot, `kb-plugin-${pid}`);
    mkdirSync(group);
    if (request.limits.memoryMb) {
      writeFileSync(join(group, 'memory.max'), String(Math.floor(request.limits.memoryMb * 1024 * 1024)));
    }
    if (request.limits.maxProcesses) {
      writeFileSync(join(group, 'pids.max'), String(Math.floor(request.limits.maxProcesses)));
    }
    writeFileSync(join(group, 'cgroup.procs'), String(pid));
    return () => {
      try {
        // Read first so cleanup never hides a process that escaped the group.
        readFileSync(join(group, 'cgroup.procs'), 'utf8');
        rmSync(group, { recursive: true, force: true });
      } catch { /* best-effort cleanup; the execution result retains usage */ }
    };
  }
}
