import type { VectorSearchMatch } from '../vector-store/vector-store';
import type { RetrievalMode } from './freshness';

export interface ConflictConfig {
  enabled: boolean;
  policy: 'freshness-first';
  maxLosersPerTopic: number;
  penalty: number;
}

export interface ConflictDiagnostics {
  applied: boolean;
  conflictsDetected: number;
  conflictTopics: number;
  penalizedChunks: number;
  policy: 'freshness-first';
}

interface RankedCandidate {
  match: VectorSearchMatch;
  topicKey: string;
  rankKey: RankKey;
}

interface RankKey {
  effectiveDate: number;
  docVersion: number;
  gitCommitTs: number;
  fileMtime: number;
  trust: number;
  path: string;
  chunkId: string;
}

export function applyConflictResolution(
  matches: VectorSearchMatch[],
  config: ConflictConfig,
  mode: RetrievalMode,
): { matches: VectorSearchMatch[]; diagnostics: ConflictDiagnostics } {
  if (!config.enabled || matches.length < 2) {
    return {
      matches,
      diagnostics: {
        applied: false,
        conflictsDetected: 0,
        conflictTopics: 0,
        penalizedChunks: 0,
        policy: 'freshness-first',
      },
    };
  }

  const candidates = matches
    .map((match) => {
      const topicKey = resolveTopicKey(match);
      if (!topicKey) {
        return null;
      }
      return {
        match,
        topicKey,
        rankKey: buildRankKey(match),
      } satisfies RankedCandidate;
    })
    .filter((item): item is RankedCandidate => !!item);

  const byTopic = new Map<string, RankedCandidate[]>();
  for (const candidate of candidates) {
    const list = byTopic.get(candidate.topicKey) ?? [];
    list.push(candidate);
    byTopic.set(candidate.topicKey, list);
  }

  let conflictsDetected = 0;
  let penalizedChunks = 0;

  for (const [topicKey, group] of byTopic) {
    if (group.length < 2) {
      continue;
    }

    group.sort((a, b) => compareRankKey(a.rankKey, b.rankKey));
    const winner = group[0]!;
    conflictsDetected += 1;

    annotateConflict(winner.match, topicKey, true, winner.match.chunk.chunkId);

    const loserPenalty = computePenalty(config.penalty, mode);
    const losers = group.slice(1, 1 + Math.max(0, config.maxLosersPerTopic));

    for (const loser of losers) {
      loser.match.score = Math.max(0, loser.match.score - loserPenalty);
      annotateConflict(loser.match, topicKey, false, winner.match.chunk.chunkId);
      penalizedChunks += 1;
    }
  }

  const ranked = [...matches].sort((a, b) => b.score - a.score);

  return {
    matches: ranked,
    diagnostics: {
      applied: conflictsDetected > 0,
      conflictsDetected,
      conflictTopics: conflictsDetected,
      penalizedChunks,
      policy: 'freshness-first',
    },
  };
}

function compareRankKey(a: RankKey, b: RankKey): number {
  if (b.effectiveDate !== a.effectiveDate) {return b.effectiveDate - a.effectiveDate;}
  if (b.docVersion !== a.docVersion) {return b.docVersion - a.docVersion;}
  if (b.gitCommitTs !== a.gitCommitTs) {return b.gitCommitTs - a.gitCommitTs;}
  if (b.fileMtime !== a.fileMtime) {return b.fileMtime - a.fileMtime;}
  if (b.trust !== a.trust) {return b.trust - a.trust;}
  if (a.path !== b.path) {return a.path.localeCompare(b.path);}
  return a.chunkId.localeCompare(b.chunkId);
}

function buildRankKey(match: VectorSearchMatch): RankKey {
  const metadata = match.chunk.metadata ?? {};
  return {
    effectiveDate: resolveTimestamp(metadata.effectiveDate),
    docVersion: resolveDocVersion(metadata.docVersion),
    gitCommitTs: resolveTimestamp(metadata.gitCommitTs),
    fileMtime: resolveTimestamp(metadata.fileMtime),
    trust: resolveTrust(metadata.sourceTrust),
    path: match.chunk.path,
    chunkId: match.chunk.chunkId,
  };
}

function resolveTopicKey(match: VectorSearchMatch): string | null {
  const metadata = match.chunk.metadata ?? {};
  const sourceKind = String(metadata.sourceKind ?? '').toLowerCase();
  const docLike = sourceKind === 'docs' || sourceKind === 'config' || isDocPath(match.chunk.path);
  if (!docLike) {
    return null;
  }
  const explicit = metadata.topicKey;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim().toLowerCase();
  }
  const docId = metadata.docId;
  if (typeof docId === 'string' && docId.trim().length > 0) {
    return docId.trim().toLowerCase();
  }
  return normalizePathTopic(match.chunk.path);
}

function normalizePathTopic(pathValue: string): string {
  return pathValue
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]?v?\d+(\.\d+)*/g, '')
    .replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}/g, '')
    .replace(/\/+/g, '/')
    .trim();
}

function isDocPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return (
    normalized.endsWith('.md') ||
    normalized.includes('/docs/') ||
    normalized.includes('/adr/') ||
    normalized.includes('/architecture/')
  );
}

function resolveTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function resolveDocVersion(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parts = value.trim().split('.');
    const major = Number(parts[0] ?? 0);
    const minor = Number(parts[1] ?? 0);
    const patch = Number(parts[2] ?? 0);
    return major * 1000000 + minor * 1000 + patch;
  }
  return 0;
}

function resolveTrust(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return 0.5;
}

function computePenalty(basePenalty: number, mode: RetrievalMode): number {
  switch (mode) {
    case 'thinking':
      return Math.min(0.35, basePenalty * 1.2);
    case 'instant':
      return Math.max(0.05, basePenalty * 0.8);
    case 'auto':
    default:
      return basePenalty;
  }
}

function annotateConflict(
  match: VectorSearchMatch,
  topicKey: string,
  winner: boolean,
  winnerChunkId: string,
): void {
  const metadata = { ...(match.chunk.metadata ?? {}) };
  metadata.conflictTopic = topicKey;
  metadata.conflictWinner = winner;
  metadata.conflictWinnerChunkId = winnerChunkId;
  match.chunk.metadata = metadata;
}
