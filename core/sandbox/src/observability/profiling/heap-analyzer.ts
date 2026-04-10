/**
 * @module @kb-labs/core-sandbox/observability/profiling/heap-analyzer
 * Automatic heap snapshot analysis
 *
 * Parses .heapsnapshot files and extracts memory insights
 */

import * as fs from 'node:fs';

export interface HeapNode {
  type: string;
  name: string;
  id: number;
  selfSize: number;
  edgeCount: number;
  traceNodeId: number;
  retainedSize?: number;
}

export interface MemoryConsumer {
  type: string;
  name: string;
  count: number;
  selfSize: number;
  retainedSize: number;
  percentage: number;
}

export interface HeapAnalysisResult {
  totalSize: number;
  nodeCount: number;
  edgeCount: number;
  topConsumers: MemoryConsumer[];
  summary: {
    objects: number;
    strings: number;
    arrays: number;
    closures: number;
    code: number;
    other: number;
  };
  patterns: {
    pattern: string;
    confidence: number;
    description: string;
  }[];
}

/**
 * HeapAnalyzer - analyzes heap snapshots
 *
 * Parses V8 heap snapshot JSON and extracts insights about memory usage
 */
export class HeapAnalyzer {
  /**
   * Analyze heap snapshot file
   */
  async analyze(snapshotPath: string): Promise<HeapAnalysisResult> {
    process.stderr.write(`[HeapAnalyzer] Analyzing ${snapshotPath}...\n`);

    // Read snapshot file
    const content = await fs.promises.readFile(snapshotPath, 'utf8');
    const snapshot = JSON.parse(content);

    // Extract metadata
    const meta = snapshot.snapshot.meta;
    const nodes = snapshot.nodes;
    const edges = snapshot.edges;
    const strings = snapshot.strings;

    // Parse nodes
    const nodeFields = meta.node_fields;
    const nodeTypeIdx = nodeFields.indexOf('type');
    const nodeNameIdx = nodeFields.indexOf('name');
    const nodeSelfSizeIdx = nodeFields.indexOf('self_size');
    const nodeEdgeCountIdx = nodeFields.indexOf('edge_count');

    const nodeFieldCount = nodeFields.length;
    const nodeCount = nodes.length / nodeFieldCount;

    // Aggregate by type and name
    const consumers = new Map<string, MemoryConsumer>();
    let totalSize = 0;

    const summary = {
      objects: 0,
      strings: 0,
      arrays: 0,
      closures: 0,
      code: 0,
      other: 0,
    };

    for (let i = 0; i < nodeCount; i++) {
      const offset = i * nodeFieldCount;

      const typeIdx = nodes[offset + nodeTypeIdx];
      const nameIdx = nodes[offset + nodeNameIdx];
      const selfSize = nodes[offset + nodeSelfSizeIdx];

      const type = strings[typeIdx] || 'unknown';
      const name = strings[nameIdx] || 'unknown';

      totalSize += selfSize;

      // Categorize by type
      if (type === 'object') {summary.objects += selfSize;}
      else if (type === 'string') {summary.strings += selfSize;}
      else if (type === 'array') {summary.arrays += selfSize;}
      else if (type === 'closure') {summary.closures += selfSize;}
      else if (type === 'code') {summary.code += selfSize;}
      else {summary.other += selfSize;}

      // Aggregate consumers
      const key = `${type}:${name}`;
      const existing = consumers.get(key);

      if (existing) {
        existing.count++;
        existing.selfSize += selfSize;
        existing.retainedSize += selfSize; // Approximation
      } else {
        consumers.set(key, {
          type,
          name,
          count: 1,
          selfSize,
          retainedSize: selfSize,
          percentage: 0,
        });
      }
    }

    // Sort by retained size
    const topConsumers = Array.from(consumers.values())
      .sort((a, b) => b.retainedSize - a.retainedSize)
      .slice(0, 20); // Top 20

    // Calculate percentages
    for (const consumer of topConsumers) {
      consumer.percentage = (consumer.retainedSize / totalSize) * 100;
    }

    // Detect patterns
    const patterns = this.detectPatterns(topConsumers, summary, totalSize);

    return {
      totalSize,
      nodeCount,
      edgeCount: edges.length / meta.edge_fields.length,
      topConsumers: topConsumers.slice(0, 10), // Top 10 for report
      summary,
      patterns,
    };
  }

  /**
   * Detect memory leak patterns
   */
  private detectPatterns(
    topConsumers: MemoryConsumer[],
    summary: HeapAnalysisResult['summary'],
    totalSize: number
  ): HeapAnalysisResult['patterns'] {
    const patterns: HeapAnalysisResult['patterns'] = [];

    // Pattern 1: Large arrays
    const arrayConsumers = topConsumers.filter(c => c.type === 'array');
    if (arrayConsumers.length > 0) {
      const totalArraySize = arrayConsumers.reduce((sum, c) => sum + c.retainedSize, 0);
      const arrayPercent = (totalArraySize / totalSize) * 100;

      if (arrayPercent > 30) {
        patterns.push({
          pattern: 'large-array-allocation',
          confidence: 0.9,
          description: `Arrays consuming ${arrayPercent.toFixed(0)}% of heap. Check for unbounded arrays or batching issues.`,
        });
      }
    }

    // Pattern 2: String accumulation
    const stringPercent = (summary.strings / totalSize) * 100;
    if (stringPercent > 40) {
      patterns.push({
        pattern: 'string-accumulation',
        confidence: 0.85,
        description: `Strings consuming ${stringPercent.toFixed(0)}% of heap. Check for .split(), .join(), or string concatenation in loops.`,
      });
    }

    // Pattern 3: Closure leak
    const closurePercent = (summary.closures / totalSize) * 100;
    if (closurePercent > 20) {
      patterns.push({
        pattern: 'closure-retention',
        confidence: 0.7,
        description: `Closures consuming ${closurePercent.toFixed(0)}% of heap. Check for event listeners or leaked callbacks.`,
      });
    }

    // Pattern 4: Code bloat
    const codePercent = (summary.code / totalSize) * 100;
    if (codePercent > 15) {
      patterns.push({
        pattern: 'code-bloat',
        confidence: 0.8,
        description: `Code consuming ${codePercent.toFixed(0)}% of heap. Check for dynamic code generation or large dependencies.`,
      });
    }

    // Pattern 5: Single large consumer
    if (topConsumers.length > 0 && topConsumers[0]!.percentage > 50) {
      patterns.push({
        pattern: 'single-large-consumer',
        confidence: 0.95,
        description: `Single consumer (${topConsumers[0]!.type}:${topConsumers[0]!.name}) using ${topConsumers[0]!.percentage.toFixed(0)}% of heap.`,
      });
    }

    return patterns;
  }

  /**
   * Format analysis as human-readable text
   */
  formatAnalysis(analysis: HeapAnalysisResult): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('📊 HEAP SNAPSHOT ANALYSIS');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');

    // Overview
    lines.push(`Total Heap Size: ${(analysis.totalSize / 1024 / 1024).toFixed(1)}MB`);
    lines.push(`Node Count: ${analysis.nodeCount.toLocaleString()}`);
    lines.push(`Edge Count: ${analysis.edgeCount.toLocaleString()}`);
    lines.push('');

    // Summary by type
    lines.push('Memory by Type:');
    const summary = analysis.summary;
    const types = [
      { name: 'Objects', size: summary.objects },
      { name: 'Strings', size: summary.strings },
      { name: 'Arrays', size: summary.arrays },
      { name: 'Closures', size: summary.closures },
      { name: 'Code', size: summary.code },
      { name: 'Other', size: summary.other },
    ].sort((a, b) => b.size - a.size);

    for (const type of types) {
      const sizeMB = (type.size / 1024 / 1024).toFixed(1);
      const percent = ((type.size / analysis.totalSize) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(Number(percent) / 5));
      lines.push(`  ${type.name.padEnd(10)} ${sizeMB.padStart(7)}MB ${percent.padStart(5)}% ${bar}`);
    }
    lines.push('');

    // Top consumers
    lines.push('🔥 TOP MEMORY CONSUMERS:');
    for (let i = 0; i < analysis.topConsumers.length && i < 10; i++) {
      const consumer = analysis.topConsumers[i]!;
      const sizeMB = (consumer.retainedSize / 1024 / 1024).toFixed(1);
      const percent = consumer.percentage.toFixed(1);
      const name = consumer.name.substring(0, 40);
      lines.push(`  ${(i + 1).toString().padStart(2)}. [${consumer.type}] ${name.padEnd(40)} ${sizeMB.padStart(7)}MB (${percent}%)`);
    }
    lines.push('');

    // Patterns
    if (analysis.patterns.length > 0) {
      lines.push('🎯 DETECTED PATTERNS:');
      for (const pattern of analysis.patterns) {
        const confidence = (pattern.confidence * 100).toFixed(0);
        lines.push(`  • ${pattern.pattern} (${confidence}% confidence)`);
        lines.push(`    ${pattern.description}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

/**
 * Create HeapAnalyzer
 */
export function createHeapAnalyzer(): HeapAnalyzer {
  return new HeapAnalyzer();
}
