import type {
  DevkitRunOutput,
  DevkitCheckOutput,
  DevkitStatsOutput,
  DevkitGateOutput,
} from './devkit.js';

export interface SnapshotGit {
  commit: string;
  branch: string;
  message: string;
}

export interface SnapshotMeta {
  id: string;
  timestamp: string;
  git?: SnapshotGit;
  durationMs: number;
  runContext?: Record<string, unknown>;
}

export interface RunSnapshot extends SnapshotMeta {
  kind: 'run';
  tasks: string[];
  raw: DevkitRunOutput;
}

export interface CheckSnapshot extends SnapshotMeta {
  kind: 'check';
  raw: DevkitCheckOutput;
}

export interface StatsSnapshot extends SnapshotMeta {
  kind: 'stats';
  raw: DevkitStatsOutput;
}

export interface GateSnapshot extends SnapshotMeta {
  kind: 'gate';
  raw: DevkitGateOutput;
}

export type AnySnapshot = RunSnapshot | CheckSnapshot | StatsSnapshot | GateSnapshot;

export interface BaselineData {
  timestamp: string;
  git?: SnapshotGit;
  check: DevkitCheckOutput;
  stats: DevkitStatsOutput;
}
