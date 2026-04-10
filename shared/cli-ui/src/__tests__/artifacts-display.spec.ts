import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';

const TEST_NOW = new Date('2025-01-01T00:06:00Z');

describe('artifacts display formatting', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
    process.env.NO_COLOR = '1';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.NO_COLOR;
  });

  it('renders detailed artifact list with metadata', async () => {
    const { displayArtifacts } = await import('../artifacts-display.js');
    const cwd = process.cwd();

    const apiArtifact = {
      name: 'API Index',
      path: path.join(cwd, 'api-index.json'),
      size: 512,
      modified: new Date('2025-01-01T00:05:00Z'),
      description: 'API index',
    };

    const indexArtifact = {
      name: 'Index',
      path: path.join(cwd, 'index.json'),
      size: 1024,
      modified: new Date('2025-01-01T00:04:00Z'),
      description: 'Primary index',
    };

    const artifacts = [indexArtifact, apiArtifact];
    const lines = displayArtifacts(artifacts, {
      title: 'Artifacts',
      showDescription: true,
    });

    const expected = [
      'Artifacts',
      `${apiArtifact.name}: ${path.relative(cwd, apiArtifact.path)}`,
      '  Size: 512 B',
      '  Updated: 1 minute ago',
      `  Note: ${apiArtifact.description}`,
      '',
      `${indexArtifact.name}: ${path.relative(cwd, indexArtifact.path)}`,
      '  Size: 1.0 KB',
      '  Updated: 2 minutes ago',
      `  Note: ${indexArtifact.description}`,
    ];

    expect(lines).toEqual(expected);
  });

  it('renders compact artifact summary', async () => {
    const { displayArtifactsCompact } = await import('../artifacts-display.js');
    const cwd = process.cwd();

    const artifact = {
      name: 'Index',
      path: path.join(cwd, 'index.json'),
      size: 1024,
      modified: new Date('2025-01-01T00:05:00Z'),
      description: '',
    };

    const lines = displayArtifactsCompact([artifact], {
      title: 'Artifacts',
      showTime: true,
      showSize: true,
    });

    const expected = [
      'Artifacts',
      `${artifact.name}: ${path.relative(cwd, artifact.path)}`,
      '  Size: 1.0 KB',
      '  Updated: 1 minute ago',
    ];

    expect(lines).toEqual(expected);
  });
});

