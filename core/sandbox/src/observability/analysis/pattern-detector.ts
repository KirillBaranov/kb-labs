/**
 * @module @kb-labs/core-sandbox/observability/analysis/pattern-detector
 * Rule-based pattern detection for common issues
 */

import type { ObservabilityEvent, MemorySnapshot } from '../events/schema';

export interface Pattern {
  id: string;
  name: string;
  description: string;
  category: string;
  severity: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
}

export interface PatternMatch {
  pattern: Pattern;
  confidence: number; // 0-1
  evidence: string[];
  recommendation?: {
    title: string;
    description: string;
    code?: string;
    links?: string[];
  };
}

/**
 * PatternDetector - detects known issue patterns
 *
 * Currently rule-based, future: ML-powered
 */
export class PatternDetector {
  private memoryTimeline: Array<{ timestamp: number; heapUsed: number }> = [];
  private errorCount: Map<string, number> = new Map();
  private lastCheck: number = Date.now();

  /**
   * Analyze event for patterns
   */
  analyze(event: ObservabilityEvent): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Track memory over time
    if (event.type === 'memory' && event.payload.snapshot) {
      this.trackMemory(event.timestamp, event.payload.snapshot);

      // Detect memory leak
      const memoryLeak = this.detectMemoryLeak();
      if (memoryLeak) {
        matches.push(memoryLeak);
      }
    }

    // Track errors
    if (event.type === 'error') {
      this.trackError(event.payload.code || event.payload.message);

      // Detect error spike
      const errorSpike = this.detectErrorSpike();
      if (errorSpike) {
        matches.push(errorSpike);
      }
    }

    return matches;
  }

  /**
   * Track memory usage
   */
  private trackMemory(timestamp: number, snapshot: MemorySnapshot): void {
    this.memoryTimeline.push({
      timestamp,
      heapUsed: snapshot.heapUsed,
    });

    // Keep last 20 measurements
    if (this.memoryTimeline.length > 20) {
      this.memoryTimeline.shift();
    }
  }

  /**
   * Track errors
   */
  private trackError(errorKey: string): void {
    const count = (this.errorCount.get(errorKey) || 0) + 1;
    this.errorCount.set(errorKey, count);

    // Reset counts every minute
    const now = Date.now();
    if (now - this.lastCheck > 60000) {
      this.errorCount.clear();
      this.lastCheck = now;
    }
  }

  /**
   * Detect memory leak pattern
   */
  private detectMemoryLeak(): PatternMatch | null {
    if (this.memoryTimeline.length < 5) {
      return null; // Need at least 5 measurements
    }

    // Calculate growth rate
    const recent = this.memoryTimeline.slice(-5);
    const first = recent[0];
    const last = recent[recent.length - 1];

    const growth = last!.heapUsed - first!.heapUsed;
    const duration = (last!.timestamp - first!.timestamp) / 1000; // seconds
    const growthRate = growth / duration; // bytes per second

    // Detect significant growth
    if (growthRate > 50 * 1024 * 1024) { // >50MB/s
      const growthMB = (growthRate / 1024 / 1024).toFixed(1);

      return {
        pattern: {
          id: 'memory-leak-fast-growth',
          name: 'Memory Leak (Fast Growth)',
          description: `Memory growing at ${growthMB}MB/s`,
          category: 'memory-leak',
          severity: 9,
        },
        confidence: 0.9,
        evidence: [
          `Heap grew ${(growth / 1024 / 1024).toFixed(0)}MB in ${duration.toFixed(1)}s`,
          `Growth rate: ${growthMB}MB/s`,
          `Measured over ${recent.length} samples`,
        ],
        recommendation: {
          title: 'Investigate memory allocations',
          description: 'Fast memory growth detected. Check for unbounded arrays, large string operations, or missing cleanup.',
          links: [
            'https://nodejs.org/en/docs/guides/simple-profiling/',
            'https://developer.chrome.com/docs/devtools/memory-problems/',
          ],
        },
      };
    }

    // Detect moderate but consistent growth
    let isConsistentGrowth = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i]!.heapUsed <= recent[i - 1]!.heapUsed) {
        isConsistentGrowth = false;
        break;
      }
    }

    if (isConsistentGrowth && growth > 100 * 1024 * 1024) { // >100MB total
      return {
        pattern: {
          id: 'memory-leak-consistent-growth',
          name: 'Memory Leak (Consistent Growth)',
          description: 'Memory consistently growing',
          category: 'memory-leak',
          severity: 7,
        },
        confidence: 0.7,
        evidence: [
          `Heap grew ${(growth / 1024 / 1024).toFixed(0)}MB`,
          'No memory decreases observed',
          `Checked ${recent.length} consecutive samples`,
        ],
        recommendation: {
          title: 'Check for memory leaks',
          description: 'Memory is consistently growing without cleanup. Look for cached data, event listeners, or circular references.',
        },
      };
    }

    return null;
  }

  /**
   * Detect error spike pattern
   */
  private detectErrorSpike(): PatternMatch | null {
    // Find max error count
    let maxCount = 0;
    let maxError = '';

    for (const [error, count] of this.errorCount.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxError = error;
      }
    }

    // Detect spike
    if (maxCount > 10) { // >10 errors per minute
      return {
        pattern: {
          id: 'error-spike',
          name: 'Error Spike',
          description: `${maxCount} errors in last minute`,
          category: 'error-spike',
          severity: 8,
        },
        confidence: 0.95,
        evidence: [
          `Error "${maxError}" occurred ${maxCount} times`,
          'Time window: 1 minute',
        ],
        recommendation: {
          title: 'Investigate error cause',
          description: 'High error rate detected. Check recent code changes or external service issues.',
        },
      };
    }

    return null;
  }

  /**
   * Get all detected patterns
   */
  getAllPatterns(): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Check all detection methods
    const memoryLeak = this.detectMemoryLeak();
    if (memoryLeak) {
      matches.push(memoryLeak);
    }

    const errorSpike = this.detectErrorSpike();
    if (errorSpike) {
      matches.push(errorSpike);
    }

    return matches;
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.memoryTimeline = [];
    this.errorCount.clear();
    this.lastCheck = Date.now();
  }
}

/**
 * Create PatternDetector
 */
export function createPatternDetector(): PatternDetector {
  return new PatternDetector();
}
