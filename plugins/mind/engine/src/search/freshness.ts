import type { VectorSearchMatch } from '../vector-store/vector-store';

export type RetrievalMode = 'instant' | 'auto' | 'thinking';

export interface FreshnessConfig {
  enabled: boolean;
  docsWeight: number;
  codeWeight: number;
  trustWeight: number;
  maxBoost: number;
  staleThresholdHours: {
    soft: number;
    hard: number;
  };
}

export interface FreshnessDiagnostics {
  applied: boolean;
  boostedCandidates: number;
  stalenessLevel: 'fresh' | 'soft-stale' | 'hard-stale';
  retrievalProfile: RetrievalMode;
}

interface WeightedScore {
  match: VectorSearchMatch;
  adjustedScore: number;
}

const HOURS_IN_MS = 60 * 60 * 1000;

export function applyFreshnessRanking(
  matches: VectorSearchMatch[],
  config: FreshnessConfig,
  mode: RetrievalMode,
  nowMs: number = Date.now(),
): { matches: VectorSearchMatch[]; diagnostics: FreshnessDiagnostics } {
  if (!config.enabled || matches.length === 0) {
    return {
      matches,
      diagnostics: {
        applied: false,
        boostedCandidates: 0,
        stalenessLevel: 'fresh',
        retrievalProfile: mode,
      },
    };
  }

  const scored: WeightedScore[] = matches.map((match) => {
    const metadata = match.chunk.metadata ?? {};
    const freshnessScore = calculateFreshnessScore(metadata, nowMs);
    const trustScore = resolveTrustScore(metadata);
    const sourceKind = String(metadata.sourceKind ?? '').toLowerCase();
    const isDocsLike = sourceKind === 'docs' || isDocPath(match.chunk.path);
    const modeMultiplier = getModeMultiplier(mode);
    const baseWeight = isDocsLike ? config.docsWeight : config.codeWeight;
    const boost = Math.min(
      config.maxBoost,
      modeMultiplier * (freshnessScore * baseWeight + trustScore * config.trustWeight),
    );

    return {
      match,
      adjustedScore: match.score + boost,
    };
  });

  scored.sort((a, b) => b.adjustedScore - a.adjustedScore);
  const boostedCandidates = scored.filter((entry) => entry.adjustedScore > entry.match.score).length;

  const topIndexedAt = resolveTopIndexedAt(scored.map((entry) => entry.match), nowMs);
  const ageHours = (nowMs - topIndexedAt) / HOURS_IN_MS;
  const stalenessLevel =
    ageHours >= config.staleThresholdHours.hard
      ? 'hard-stale'
      : ageHours >= config.staleThresholdHours.soft
        ? 'soft-stale'
        : 'fresh';

  return {
    matches: scored.map((entry) => ({
      ...entry.match,
      score: entry.adjustedScore,
    })),
    diagnostics: {
      applied: true,
      boostedCandidates,
      stalenessLevel,
      retrievalProfile: mode,
    },
  };
}

export function resolveRetrievalMode(value: unknown): RetrievalMode {
  if (value === 'instant' || value === 'thinking' || value === 'auto') {
    return value;
  }
  return 'auto';
}

function calculateFreshnessScore(metadata: Record<string, unknown>, nowMs: number): number {
  const effectiveDateMs = resolveTimestamp(metadata.effectiveDate);
  const gitCommitTsMs = resolveTimestamp(metadata.gitCommitTs);
  const fileMtimeMs = resolveTimestamp(metadata.fileMtime);
  const indexedAtMs = resolveTimestamp(metadata.indexedAt);

  const newestTs = Math.max(
    effectiveDateMs ?? 0,
    gitCommitTsMs ?? 0,
    fileMtimeMs ?? 0,
    indexedAtMs ?? 0,
  );

  if (newestTs <= 0) {
    return 0.25;
  }

  const ageHours = Math.max(0, (nowMs - newestTs) / HOURS_IN_MS);
  if (ageHours <= 24) {return 1;}
  if (ageHours <= 72) {return 0.8;}
  if (ageHours <= 168) {return 0.5;}
  return 0.2;
}

function resolveTrustScore(metadata: Record<string, unknown>): number {
  const raw = metadata.sourceTrust;
  if (typeof raw === 'number') {
    return Math.min(1, Math.max(0, raw));
  }
  return 0.5;
}

function getModeMultiplier(mode: RetrievalMode): number {
  switch (mode) {
    case 'instant':
      return 0.7;
    case 'thinking':
      return 1.2;
    case 'auto':
    default:
      return 1;
  }
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

function resolveTopIndexedAt(matches: VectorSearchMatch[], fallbackMs: number): number {
  for (const match of matches) {
    const indexedAt = resolveTimestamp(match.chunk.metadata?.indexedAt);
    if (indexedAt !== undefined) {
      return indexedAt;
    }
  }
  return fallbackMs;
}

function resolveTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}
