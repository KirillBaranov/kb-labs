import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { safeColors } from './colors';
import { formatSize, formatRelativeTime, safeKeyValue } from './format';

export interface ArtifactInfo {
  name: string;
  path: string;
  size?: number;
  modified?: Date;
  description: string;
}

export interface ArtifactDisplayOptions {
  showSize?: boolean;
  showTime?: boolean;
  showDescription?: boolean;
  maxItems?: number;
  title?: string;
  groupBy?: 'none' | 'type' | 'time';
}

/**
 * Display artifacts information in CLI
 */
export function displayArtifacts(
  artifacts: ArtifactInfo[],
  options: ArtifactDisplayOptions = {},
): string[] {
  const {
    showSize = true,
    showTime = true,
    showDescription = false,
    maxItems = 10,
    title = 'Generated Artifacts',
    groupBy = 'none'
  } = options;

  if (artifacts.length === 0) {
    return [];
  }

  // Sort and limit artifacts
  let sortedArtifacts = artifacts;
  
  if (groupBy === 'time') {
    sortedArtifacts = [...artifacts].sort(
      (a, b) => (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0),
    );
  } else if (groupBy === 'type') {
    sortedArtifacts = [...artifacts].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    sortedArtifacts = [...artifacts].sort(
      (a, b) => (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0),
    );
  }

  sortedArtifacts = sortedArtifacts.slice(0, maxItems);

  const lines: string[] = [];

  if (title) {
    lines.push(safeColors.bold(title));
  }

  if (groupBy === 'type') {
    const grouped = sortedArtifacts.reduce((acc, artifact) => {
      const type = artifact.name.split(' ')[0] || 'Other';
      if (!acc[type]) {acc[type] = [];}
      acc[type]!.push(artifact);
      return acc;
    }, {} as Record<string, ArtifactInfo[]>);

    Object.entries(grouped).forEach(([type, items], index) => {
      if (index > 0 || title) {
        lines.push('');
      }
      lines.push(...safeKeyValue({ [type]: '' }, { pad: false }));
      items.forEach((artifact, artifactIndex) => {
        if (artifactIndex > 0) {
          lines.push('');
        }
        lines.push(...formatArtifactLines(artifact, {
          showSize,
          showTime,
          showDescription,
          indent: 2,
        }));
      });
    });
    return lines;
  }

  sortedArtifacts.forEach((artifact, index) => {
    if (index > 0) {
      lines.push('');
    }
    lines.push(...formatArtifactLines(artifact, {
      showSize,
      showTime,
      showDescription,
      indent: 0,
    }));
  });

  return lines;
}

/**
 * Format a single artifact line
 */
function formatArtifactLines(
  artifact: ArtifactInfo,
  options: {
    showSize: boolean;
    showTime: boolean;
    showDescription: boolean;
    indent: number;
  },
): string[] {
  const { showSize, showTime, showDescription, indent } = options;
  const relativePath = path.relative(process.cwd(), artifact.path);
  const lines: string[] = [];
  lines.push(
    ...safeKeyValue({ [artifact.name]: relativePath }, { pad: false, indent }),
  );
  if (showSize && artifact.size) {
    lines.push(
      ...safeKeyValue({ Size: formatSize(artifact.size) }, { pad: false, indent: indent + 2 }),
    );
  }

  if (showTime && artifact.modified) {
    lines.push(
      ...safeKeyValue({ Updated: formatRelativeTime(artifact.modified) }, { pad: false, indent: indent + 2 }),
    );
  }

  if (showDescription && artifact.description) {
    lines.push(
      ...safeKeyValue({ Note: artifact.description }, { pad: false, indent: indent + 2 }),
    );
  }

  return lines;
}

/**
 * Display a single artifact with full details
 */
export function displaySingleArtifact(artifact: ArtifactInfo, title?: string): string[] {
  const relativePath = path.relative(process.cwd(), artifact.path);
  const lines: string[] = [];
  
  if (title) {
    lines.push('');
    lines.push(safeColors.bold(title));
  }
  
  lines.push(`  ${safeColors.bold(artifact.name)}: ${safeColors.info(relativePath)}`);
  
  if (artifact.size) {
    lines.push(`    Size: ${formatSize(artifact.size)}`);
  }
  
  if (artifact.modified) {
    lines.push(`    Modified: ${formatRelativeTime(artifact.modified)}`);
  }
  
  if (artifact.description) {
    lines.push(`    Description: ${artifact.description}`);
  }
  
  return lines;
}

/**
 * Display artifacts in a compact format (for status-like displays)
 */
export function displayArtifactsCompact(
  artifacts: ArtifactInfo[],
  options: {
    maxItems?: number;
    showSize?: boolean;
    sortByTime?: boolean;
    showTime?: boolean;
    title?: string;
  } = {},
): string[] {
  const {
    maxItems = 5,
    showSize = true,
    sortByTime = true,
    showTime = true,
    title = 'Artifacts',
  } = options;
  
  if (artifacts.length === 0) {
    return [];
  }

  const sortedArtifacts = (sortByTime
    ? [...artifacts].sort((a, b) => (b.modified?.getTime() ?? 0) - (a.modified?.getTime() ?? 0))
    : artifacts.slice()
  ).slice(0, maxItems);

  const lines: string[] = [];
  lines.push(safeColors.bold(title));

  sortedArtifacts.forEach((artifact, index) => {
    if (index > 0) {
      lines.push('');
    }
    lines.push(
      ...formatArtifactLines(artifact, {
        showSize,
        showTime,
        showDescription: false,
        indent: 0,
      }),
    );
  });

  return lines;
}

/**
 * Discover artifacts in a directory based on patterns
 * 
 * @param baseDir - Base directory to search for artifacts
 * @param patterns - Array of artifact patterns to search for
 * @returns Array of discovered artifacts
 * 
 * @example
 * ```typescript
 * const artifacts = await discoverArtifacts('.kb/mind', [
 *   { name: 'Index', pattern: 'index.json', description: 'Main index' },
 *   { name: 'API Index', pattern: 'api-index.json', description: 'API index' },
 * ]);
 * ```
 */
export async function discoverArtifacts(
  baseDir: string,
  patterns: Array<{ name: string; pattern: string; description?: string }>
): Promise<ArtifactInfo[]> {
  const artifacts: ArtifactInfo[] = [];

  for (const artifact of patterns) {
    const artifactPath = path.join(baseDir, artifact.pattern);
    try {
      await fsp.access(artifactPath);
      const stats = await fsp.stat(artifactPath);
      artifacts.push({
        name: artifact.name,
        path: artifactPath,
        size: stats.size,
        modified: stats.mtime,
        description: artifact.description || ''
      });
    } catch {
      // Skip if file doesn't exist
    }
  }

  return artifacts;
}
