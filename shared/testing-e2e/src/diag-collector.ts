import { writeFile } from 'node:fs/promises';

import type {
  AdapterStageTrace,
  ConfigLayersDiag,
  DiagSnapshot,
  KbLogEvent,
  PluginDiscoveryDiag,
  PluginGovernanceTrace,
  ServiceDiag,
} from './diag-types.js';
import type { StatusSnapshot } from './types.js';

/**
 * Collects KB_DEBUG diagnostic events emitted by service processes.
 *
 * Instantiated by KbDevController when KB_DEBUG=true. Each stdout line from
 * subprocesses passes through parseLine(); lines that carry a kb.diag.* event
 * are parsed and routed into per-domain buckets. buildSnapshot() assembles the
 * final DiagSnapshot for attachment to failed tests.
 */
export class DiagCollector {
  private readonly pipelineTraces: AdapterStageTrace[] = [];
  private readonly governanceTraces: PluginGovernanceTrace[] = [];
  private configDiag: Partial<ConfigLayersDiag> = {};
  private discoveryDiag: Partial<PluginDiscoveryDiag> = {};
  private serviceMap: Record<string, ServiceDiag> = {};

  /**
   * Parse a single stdout line from a service process.
   * Lines that do not contain a kb.diag.* event are ignored cheaply.
   */
  parseLine(line: string): void {
    // Fast string check before JSON.parse to avoid cost on ordinary log lines
    if (!line.includes('"event":"kb.diag.')) { return; }
    try {
      const obj = JSON.parse(line) as KbLogEvent;
      if (typeof obj.event !== 'string' || obj.v !== 1) { return; }
      switch (obj.event) {
        case 'kb.diag.pipeline':
          this.pipelineTraces.push(...(obj.data as AdapterStageTrace[]));
          break;
        case 'kb.diag.governance':
          this.governanceTraces.push(obj.data as PluginGovernanceTrace);
          break;
        case 'kb.diag.config':
          this.configDiag = obj.data as ConfigLayersDiag;
          break;
        case 'kb.diag.discovery':
          this.discoveryDiag = obj.data as PluginDiscoveryDiag;
          break;
      }
    } catch {
      // Malformed line — silently ignore; never throw inside logSink
    }
  }

  /** Merge live service status into the snapshot (call after ensureServices/status). */
  ingestStatusSnapshot(snap: StatusSnapshot): void {
    for (const [id, svc] of Object.entries(snap.services)) {
      this.serviceMap[id] = {
        port: svc.port,
        pid: svc.pid,
        url: svc.url,
        state: svc.state,
      };
    }
  }

  buildSnapshot(): DiagSnapshot {
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      pipeline: [...this.pipelineTraces],
      governance: [...this.governanceTraces],
      config: { ...this.configDiag },
      discovery: { ...this.discoveryDiag },
      services: { ...this.serviceMap },
    };
  }

  async writeSnapshot(path: string): Promise<void> {
    const snapshot = this.buildSnapshot();
    await writeFile(path, JSON.stringify(snapshot, null, 2), 'utf8');
  }
}
