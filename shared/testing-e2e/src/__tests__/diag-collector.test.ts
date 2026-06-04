import { describe, it, expect, beforeEach } from 'vitest';

import { DiagCollector } from '../diag-collector.js';
import type { AdapterStageTrace, ConfigLayersDiag, PluginDiscoveryDiag, PluginGovernanceTrace } from '../diag-types.js';

// Helpers for building synthetic pino-style JSON lines
function makeLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}

describe('DiagCollector', () => {
  let collector: DiagCollector;

  beforeEach(() => {
    collector = new DiagCollector();
  });

  describe('parseLine', () => {
    it('ignores lines that do not contain the kb.diag. marker', () => {
      collector.parseLine('{"level":30,"msg":"hello world"}');
      collector.parseLine('not json at all');
      collector.parseLine('');
      const snap = collector.buildSnapshot();
      expect(snap.pipeline).toHaveLength(0);
      expect(snap.governance).toHaveLength(0);
    });

    it('ignores malformed JSON that happens to contain the marker', () => {
      expect(() => {
        collector.parseLine('"event":"kb.diag.pipeline" broken {{{');
      }).not.toThrow();
      expect(collector.buildSnapshot().pipeline).toHaveLength(0);
    });

    it('ignores envelopes with wrong version', () => {
      collector.parseLine(makeLine({ event: 'kb.diag.pipeline', v: 2, data: [] }));
      expect(collector.buildSnapshot().pipeline).toHaveLength(0);
    });

    it('accumulates pipeline traces from multiple lines', () => {
      const trace1: AdapterStageTrace[] = [
        { adapter: 'llm', stage: 'resourceBrokerFactory', applied: true },
        { adapter: 'llm', stage: 'analyticsFactory', applied: true },
      ];
      const trace2: AdapterStageTrace[] = [
        { adapter: 'cache', stage: 'resourceBrokerFactory', applied: false },
      ];
      collector.parseLine(makeLine({ event: 'kb.diag.pipeline', v: 1, data: trace1, ts: 1 }));
      collector.parseLine(makeLine({ event: 'kb.diag.pipeline', v: 1, data: trace2, ts: 2 }));

      expect(collector.buildSnapshot().pipeline).toHaveLength(3);
      expect(collector.buildSnapshot().pipeline[0].adapter).toBe('llm');
      expect(collector.buildSnapshot().pipeline[2].adapter).toBe('cache');
    });

    it('accumulates governance traces', () => {
      const govTrace: PluginGovernanceTrace = {
        adapter: 'llm',
        pluginId: 'my-plugin',
        middlewaresApplied: [{ name: 'rate-limiter', slot: 'post-router', priority: 0 }],
        governanceStrategy: 'wrap',
      };
      collector.parseLine(makeLine({ event: 'kb.diag.governance', v: 1, data: govTrace, ts: 1 }));
      expect(collector.buildSnapshot().governance).toHaveLength(1);
      expect(collector.buildSnapshot().governance[0].pluginId).toBe('my-plugin');
    });

    it('stores last config diag (overwrites on repeat)', () => {
      const config1: ConfigLayersDiag = {
        platformConfigPath: '/a/kb.config.jsonc',
        projectConfigPath: '/b/.kb/kb.config.json',
        overlayPaths: [],
        fieldSources: { 'llm.model': 'project' },
        ignoredProjectFields: [],
      };
      const config2: ConfigLayersDiag = {
        platformConfigPath: '/c/kb.config.jsonc',
        projectConfigPath: undefined,
        overlayPaths: ['/b/.kb/overlays/dev.jsonc'],
        fieldSources: {},
        ignoredProjectFields: ['adapters'],
      };
      collector.parseLine(makeLine({ event: 'kb.diag.config', v: 1, data: config1, ts: 1 }));
      collector.parseLine(makeLine({ event: 'kb.diag.config', v: 1, data: config2, ts: 2 }));

      expect(collector.buildSnapshot().config.platformConfigPath).toBe('/c/kb.config.jsonc');
      expect(collector.buildSnapshot().config.overlayPaths).toHaveLength(1);
    });

    it('stores discovery diag', () => {
      const disc: PluginDiscoveryDiag = {
        loaded: [{ id: '@kb-labs/workflow-entry', version: '1.0.0', source: 'marketplace' }],
        skipped: [{ code: 'MANIFEST_NOT_FOUND', message: 'No manifest', pluginId: '@kb-labs/bad-plugin' }],
      };
      collector.parseLine(makeLine({ event: 'kb.diag.discovery', v: 1, data: disc, ts: 1 }));

      const snap = collector.buildSnapshot();
      expect(snap.discovery.loaded).toHaveLength(1);
      expect(snap.discovery.skipped).toHaveLength(1);
      expect(snap.discovery.skipped![0].code).toBe('MANIFEST_NOT_FOUND');
    });
  });

  describe('ingestStatusSnapshot', () => {
    it('merges service data into snapshot', () => {
      collector.ingestStatusSnapshot({
        ok: true,
        summary: { alive: 1, starting: 0, failed: 0, dead: 0, stopping: 0, total: 1 },
        services: {
          gateway: { state: 'alive', port: 4000, pid: 9999, url: 'http://localhost:4000' },
        },
      });

      const snap = collector.buildSnapshot();
      expect(snap.services['gateway']?.port).toBe(4000);
      expect(snap.services['gateway']?.state).toBe('alive');
    });
  });

  describe('buildSnapshot', () => {
    it('returns schemaVersion 1 and a capturedAt timestamp', () => {
      const snap = collector.buildSnapshot();
      expect(snap.schemaVersion).toBe(1);
      expect(typeof snap.capturedAt).toBe('string');
      expect(snap.capturedAt).toMatch(/^\d{4}-/);
    });

    it('returns empty collections when nothing was collected', () => {
      const snap = collector.buildSnapshot();
      expect(snap.pipeline).toHaveLength(0);
      expect(snap.governance).toHaveLength(0);
      expect(snap.config).toEqual({});
      expect(snap.discovery).toEqual({});
      expect(snap.services).toEqual({});
    });
  });
});
