/**
 * @module @kb-labs/core-sandbox/debug/insights
 * Automatic insights and recommendations engine
 */

import type { ProfileData } from '../monitoring/profiler';
import type { ExecMetrics } from '../types/index';

/**
 * Insight type
 */
export type InsightType = 'performance' | 'reliability' | 'security' | 'best-practice';

/**
 * Insight severity
 */
export type InsightSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Execution insight
 */
export interface ExecutionInsight {
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  recommendation: {
    action: string;
    code?: string;
    documentation?: string;
    estimatedImpact: string;
  };
  evidence: {
    metrics?: Record<string, number>;
    logs?: string[];
    traces?: string[];
  };
}

/**
 * Analyze execution for insights
 */
export function analyzeInsights(
  metrics: ExecMetrics,
  profile?: ProfileData,
  logs?: string[]
): ExecutionInsight[] {
  const insights: ExecutionInsight[] = [];

  // Performance insights
  if (metrics.timeMs > 10000) {
    insights.push({
      type: 'performance',
      severity: metrics.timeMs > 30000 ? 'high' : 'medium',
      title: 'Slow Execution',
      description: `Execution took ${metrics.timeMs}ms, which is above the recommended threshold.`,
      recommendation: {
        action: 'Optimize slow operations or add caching',
        documentation: 'https://kb-labs.dev/docs/performance-optimization',
        estimatedImpact: `Potential ${Math.round((metrics.timeMs - 5000) / 100)}% reduction in execution time`,
      },
      evidence: {
        metrics: { durationMs: metrics.timeMs },
      },
    });
  }

  // Memory insights
  if (metrics.memMb && metrics.memMb > 256) {
    insights.push({
      type: 'performance',
      severity: metrics.memMb > 512 ? 'high' : 'medium',
      title: 'High Memory Usage',
      description: `Memory usage reached ${metrics.memMb}MB, which may indicate memory leaks or inefficient data structures.`,
      recommendation: {
        action: 'Consider streaming large files or using more efficient data structures',
        code: `// Instead of loading entire file:\nconst data = await fs.readFile(file);\n\n// Use streaming:\nconst stream = fs.createReadStream(file);`,
        documentation: 'https://kb-labs.dev/docs/memory-optimization',
        estimatedImpact: `Potential ${Math.round((metrics.memMb - 128) / 10)}% reduction in memory usage`,
      },
      evidence: {
        metrics: { memoryMb: metrics.memMb },
      },
    });
  }

  // Profile-based insights
  if (profile) {
    // Check for slow phases
    const slowPhases = profile.phases.filter((p) => (p.duration || 0) > 1000);
    if (slowPhases.length > 0) {
      const slowestPhase = slowPhases.reduce((a, b) =>
        (a.duration || 0) > (b.duration || 0) ? a : b
      );
      insights.push({
        type: 'performance',
        severity: (slowestPhase.duration || 0) > 5000 ? 'high' : 'medium',
        title: 'Slow Phase Detected',
        description: `Phase "${slowestPhase.name}" took ${slowestPhase.duration}ms, which is ${Math.round(((slowestPhase.duration || 0) / profile.totalDuration) * 100)}% of total execution time.`,
        recommendation: {
          action: `Optimize operations in "${slowestPhase.name}" phase`,
          documentation: 'https://kb-labs.dev/docs/profiling',
          estimatedImpact: `Potential ${Math.round(((slowestPhase.duration || 0) / profile.totalDuration) * 100)}% reduction in total time`,
        },
        evidence: {
          metrics: {
            phaseDuration: slowestPhase.duration || 0,
            totalDuration: profile.totalDuration,
          },
        },
      });
    }

    // Check for excessive I/O operations
    if (profile.operations.fs.total > 100) {
      const avgOpTime = profile.totalDuration / profile.operations.fs.total;
      if (avgOpTime > 10) {
        insights.push({
          type: 'performance',
          severity: profile.operations.fs.total > 500 ? 'high' : 'medium',
          title: 'Excessive File System Operations',
          description: `Performed ${profile.operations.fs.total} file system operations (${profile.operations.fs.reads} reads, ${profile.operations.fs.writes} writes) with average ${avgOpTime.toFixed(1)}ms per operation.`,
          recommendation: {
            action: 'Use batch operations or caching to reduce I/O operations',
            code: `// Instead of multiple reads:\nfor (const file of files) {\n  await fs.readFile(file);\n}\n\n// Use Promise.all:\nawait Promise.all(files.map(f => fs.readFile(f)));`,
            documentation: 'https://kb-labs.dev/docs/io-optimization',
            estimatedImpact: `Potential ${Math.round((profile.operations.fs.total - 50) / 10)}% reduction in I/O operations`,
          },
          evidence: {
            metrics: {
              fsOperations: profile.operations.fs.total,
              reads: profile.operations.fs.reads,
              writes: profile.operations.fs.writes,
              avgOpTime,
            },
          },
        });
      }
    }

    // Check for memory growth
    if (profile.memory.final > profile.memory.initial * 2) {
      const growth = profile.memory.final - profile.memory.initial;
      insights.push({
        type: 'reliability',
        severity: growth > 200 ? 'high' : 'medium',
        title: 'Memory Growth Detected',
        description: `Memory usage increased from ${profile.memory.initial}MB to ${profile.memory.final}MB (${growth}MB growth), which may indicate a memory leak.`,
        recommendation: {
          action: 'Review code for unclosed resources, event listeners, or circular references',
          documentation: 'https://kb-labs.dev/docs/memory-leaks',
          estimatedImpact: 'Prevent potential out-of-memory errors',
        },
        evidence: {
          metrics: {
            initialMemory: profile.memory.initial,
            finalMemory: profile.memory.final,
            growth: growth,
          },
        },
      });
    }
  }

  // Log-based insights
  if (logs) {
    const errorCount = logs.filter((l) =>
      l.toLowerCase().includes('error') || l.includes('✗') || l.includes('failed')
    ).length;
    const warnCount = logs.filter((l) =>
      l.toLowerCase().includes('warn') || l.includes('⚠')
    ).length;

    if (errorCount > 0) {
      insights.push({
        type: 'reliability',
        severity: errorCount > 5 ? 'high' : 'medium',
        title: 'Errors Detected During Execution',
        description: `Found ${errorCount} error${errorCount > 1 ? 's' : ''} in execution logs, which may indicate reliability issues.`,
        recommendation: {
          action: 'Review error logs and fix underlying issues',
          documentation: 'https://kb-labs.dev/docs/error-handling',
          estimatedImpact: 'Improve execution reliability',
        },
        evidence: {
          logs: logs.filter((l) =>
            l.toLowerCase().includes('error') || l.includes('✗') || l.includes('failed')
          ).slice(0, 5),
        },
      });
    }

    // Check for deprecated API usage
    const deprecatedPatterns = [
      /execa\(/,
      /child_process\.(spawn|exec)/,
      /require\(['"]@kb-labs\/.*\/types['"]\)/,
    ];
    const deprecatedMatches = logs.filter((l) =>
      deprecatedPatterns.some((pattern) => pattern.test(l))
    );
    if (deprecatedMatches.length > 0) {
      insights.push({
        type: 'best-practice',
        severity: 'low',
        title: 'Deprecated API Usage Detected',
        description: 'Found usage of deprecated APIs in logs. Consider migrating to newer APIs.',
        recommendation: {
          action: 'Migrate to ShellApi from @kb-labs/plugin-contracts instead of direct execa calls',
          code: `// Instead of:\nimport execa from 'execa';\nawait execa('command', ['args']);\n\n// Use:\nawait ctx.extensions.shell.exec('command', ['args']);`,
          documentation: 'https://kb-labs.dev/docs/shell-api',
          estimatedImpact: 'Better compatibility and future-proofing',
        },
        evidence: {
          logs: deprecatedMatches.slice(0, 3),
        },
      });
    }
  }

  return insights;
}

/**
 * Format insights for display
 */
export function formatInsights(insights: ExecutionInsight[]): string {
  if (insights.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push(`💡 Insights (${insights.length} found):\n`);

  for (const insight of insights) {
    const severityEmoji = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
    }[insight.severity];

    lines.push(`[${insight.severity.toUpperCase()}] ${insight.title}`);
    lines.push(`  ├─ ${insight.description}`);
    lines.push(`  ├─ Recommendation: ${insight.recommendation.action}`);
    if (insight.recommendation.code) {
      lines.push(`  ├─ Code:`);
      insight.recommendation.code.split('\n').forEach((line) => {
        lines.push(`  │  ${line}`);
      });
    }
    lines.push(`  └─ Estimated Impact: ${insight.recommendation.estimatedImpact}`);
    if (insight.recommendation.documentation) {
      lines.push(`     Documentation: ${insight.recommendation.documentation}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

