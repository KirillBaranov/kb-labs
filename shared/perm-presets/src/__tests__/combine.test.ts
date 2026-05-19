import { describe, it, expect } from 'vitest';
import { combine, combinePresets } from '../combine';
import { minimal, gitWorkflow, npmPublish, kbPlatform } from '../presets';
import type { PermissionPreset } from '../types';

describe('combine()', () => {
  it('should return empty spec when nothing added', () => {
    const result = combine().build();
    expect(result).toEqual({});
  });

  it('should add a single preset', () => {
    const result = combine().with(minimal).build();
    expect(result.env?.read).toContain('PATH');
    expect(result.env?.read).toContain('NODE_ENV');
  });

  it('should merge two presets', () => {
    const result = combine()
      .with(minimal)
      .with(gitWorkflow)
      .build();

    const envVars = result.env?.read ?? [];
    // From minimal
    expect(envVars).toContain('PATH');
    expect(envVars).toContain('NODE_ENV');
    // From gitWorkflow
    expect(envVars).toContain('HOME');
    expect(envVars).toContain('USER');
    expect(envVars).toContain('GIT_*');
  });

  it('should deduplicate env vars', () => {
    const result = combine()
      .with(gitWorkflow)
      .with(npmPublish)
      .build();

    const envVars = result.env?.read ?? [];
    // Both have HOME, USER, PATH - should appear once
    const homeCount = envVars.filter(v => v === 'HOME').length;
    expect(homeCount).toBe(1);
  });

  it('should merge fs.allow arrays and convert to runtime format', () => {
    const result = combine()
      .with(gitWorkflow)
      .with(npmPublish)
      .build();

    // After build(), format is runtime (read/write arrays)
    const read = result.fs?.read ?? [];
    // From gitWorkflow
    expect(read).toContain('**/.git/**');
    // From npmPublish
    expect(read).toContain('**/package.json');
  });

  it('should merge network domains', () => {
    const result = combine()
      .with(npmPublish)
      .withNetwork({ fetch: ['api.example.com'] })
      .build();

    const domains = result.network?.fetch ?? [];
    expect(domains).toContain('registry.npmjs.org');
    expect(domains).toContain('api.example.com');
  });

  describe('withEnv()', () => {
    it('should add custom env vars', () => {
      const result = combine()
        .with(minimal)
        .withEnv(['MY_CUSTOM_VAR', 'ANOTHER_VAR'])
        .build();

      const envVars = result.env?.read ?? [];
      expect(envVars).toContain('MY_CUSTOM_VAR');
      expect(envVars).toContain('ANOTHER_VAR');
      expect(envVars).toContain('PATH');
    });
  });

  describe('withFs()', () => {
    it('should add fs permissions and convert to runtime format', () => {
      const result = combine()
        .with(minimal)
        .withFs({ mode: 'readWrite', allow: ['./data/**'] })
        .build();

      // After build(), format is runtime (read/write arrays)
      expect(result.fs?.read).toContain('./data/**');
      expect(result.fs?.write).toContain('./data/**');
    });

    it('should merge with existing fs', () => {
      const result = combine()
        .with(gitWorkflow)
        .withFs({ allow: ['./custom/**'] })
        .build();

      const read = result.fs?.read ?? [];
      expect(read).toContain('**/.git/**');
      expect(read).toContain('./custom/**');
    });
  });

  describe('withQuotas()', () => {
    it('should add quotas', () => {
      const result = combine()
        .with(minimal)
        .withQuotas({ timeoutMs: 30000, memoryMb: 512 })
        .build();

      expect(result.quotas?.timeoutMs).toBe(30000);
      expect(result.quotas?.memoryMb).toBe(512);
    });

    it('should override quotas (last wins)', () => {
      const result = combine()
        .withQuotas({ timeoutMs: 10000 })
        .withQuotas({ timeoutMs: 30000 })
        .build();

      expect(result.quotas?.timeoutMs).toBe(30000);
    });
  });

  describe('withPlatform()', () => {
    it('should add platform permissions with booleans', () => {
      const result = combine()
        .with(minimal)
        .withPlatform({
          llm: true,
          cache: true,
          analytics: true,
        })
        .build();

      expect(result.platform?.llm).toBe(true);
      expect(result.platform?.cache).toBe(true);
      expect(result.platform?.analytics).toBe(true);
    });

    it('should add platform permissions with arrays', () => {
      const result = combine()
        .with(minimal)
        .withPlatform({
          cache: ['git-status:', 'workflow:'],
          storage: ['uploads/', 'temp/'],
        })
        .build();

      expect(result.platform?.cache).toEqual(['git-status:', 'workflow:']);
      expect(result.platform?.storage).toEqual(['uploads/', 'temp/']);
    });

    it('should add platform permissions with objects', () => {
      const result = combine()
        .with(minimal)
        .withPlatform({
          llm: { models: ['gpt-4', 'claude-3'] },
          vectorStore: { collections: ['docs', 'code'] },
          eventBus: { publish: ['events.*'], subscribe: ['jobs.*'] },
        })
        .build();

      expect(result.platform?.llm).toEqual({ models: ['gpt-4', 'claude-3'] });
      expect(result.platform?.vectorStore).toEqual({ collections: ['docs', 'code'] });
      expect(result.platform?.eventBus).toEqual({ publish: ['events.*'], subscribe: ['jobs.*'] });
    });

    it('should merge platform arrays (union)', () => {
      const result = combine()
        .withPlatform({
          cache: ['git-status:'],
          storage: ['uploads/'],
        })
        .withPlatform({
          cache: ['workflow:'],
          storage: ['temp/'],
        })
        .build();

      // Arrays should be merged (union)
      expect(result.platform?.cache).toEqual(['git-status:', 'workflow:']);
      expect(result.platform?.storage).toEqual(['uploads/', 'temp/']);
    });

    it('should merge platform objects (spread)', () => {
      const result = combine()
        .withPlatform({
          llm: { models: ['gpt-4'] },
          vectorStore: { collections: ['docs'] },
        })
        .withPlatform({
          llm: { models: ['claude-3'] },
          vectorStore: { collections: ['code'] },
        })
        .build();

      // Objects should be merged (last wins for same keys)
      expect(result.platform?.llm).toEqual({ models: ['claude-3'] });
      expect(result.platform?.vectorStore).toEqual({ collections: ['code'] });
    });

    it('should override booleans (last wins)', () => {
      const result = combine()
        .withPlatform({ analytics: false })
        .withPlatform({ analytics: true })
        .build();

      expect(result.platform?.analytics).toBe(true);
    });

    it('should merge with existing platform permissions from presets', () => {
      const presetWithPlatform: PermissionPreset = {
        id: 'test-preset',
        description: 'Test preset with platform',
        permissions: {
          platform: {
            llm: true,
            cache: ['preset:'],
          },
        },
      };

      const result = combine()
        .with(presetWithPlatform)
        .withPlatform({
          cache: ['custom:'],
          analytics: true,
        })
        .build();

      expect(result.platform?.llm).toBe(true);
      expect(result.platform?.cache).toEqual(['preset:', 'custom:']);
      expect(result.platform?.analytics).toBe(true);
    });

    it('should deduplicate array values in platform permissions', () => {
      const result = combine()
        .withPlatform({
          cache: ['git-status:', 'workflow:'],
        })
        .withPlatform({
          cache: ['git-status:', 'cache:'], // git-status: is duplicate
        })
        .build();

      // Should deduplicate git-status:
      const cache = result.platform?.cache as string[];
      expect(cache).toHaveLength(3);
      expect(cache).toContain('git-status:');
      expect(cache).toContain('workflow:');
      expect(cache).toContain('cache:');
    });

    it('should handle undefined platform gracefully', () => {
      const result = combine()
        .with(minimal)
        .withPlatform(undefined as any)
        .build();

      expect(result.platform).toBeUndefined();
    });

    it('should pass through platform to runtime format unchanged', () => {
      const result = combine()
        .withPlatform({
          llm: { models: ['gpt-4'] },
          cache: ['git:'],
          analytics: true,
        })
        .build();

      // Platform permissions should pass through to runtime format unchanged
      expect(result.platform?.llm).toEqual({ models: ['gpt-4'] });
      expect(result.platform?.cache).toEqual(['git:']);
      expect(result.platform?.analytics).toBe(true);
    });
  });

  describe('with raw PermissionSpec', () => {
    it('should accept raw spec without id/description', () => {
      const result = combine()
        .with({ env: { read: ['CUSTOM_VAR'] } })
        .build();

      expect(result.env?.read).toContain('CUSTOM_VAR');
    });
  });
});

describe('combinePresets()', () => {
  it('should combine multiple presets at once', () => {
    const result = combinePresets(minimal, gitWorkflow, kbPlatform);

    const envVars = result.env?.read ?? [];
    expect(envVars).toContain('PATH');
    expect(envVars).toContain('HOME');
    expect(envVars).toContain('KB_*');
  });

  it('should work with single preset', () => {
    const result = combinePresets(gitWorkflow);
    expect(result.env?.read).toContain('HOME');
  });

  it('should return empty spec with no presets', () => {
    const result = combinePresets();
    expect(result).toEqual({});
  });
});

describe('Real-world scenarios', () => {
  it('should create commit-plugin permissions (git + kb-platform)', () => {
    const result = combine()
      .with(gitWorkflow)
      .with(kbPlatform)
      .withEnv(['OPENAI_API_KEY'])
      .build();

    const envVars = result.env?.read ?? [];
    // Git needs
    expect(envVars).toContain('HOME');
    expect(envVars).toContain('USER');
    expect(envVars).toContain('GIT_*');
    // KB platform needs
    expect(envVars).toContain('KB_*');
    // Custom
    expect(envVars).toContain('OPENAI_API_KEY');
  });

  it('should create release-plugin permissions (git + npm + kb-platform)', () => {
    const result = combine()
      .with(gitWorkflow)
      .with(npmPublish)
      .with(kbPlatform)
      .withQuotas({ timeoutMs: 300000 })
      .build();

    const envVars = result.env?.read ?? [];
    expect(envVars).toContain('HOME');
    expect(envVars).toContain('GIT_*');
    expect(envVars).toContain('NPM_TOKEN');
    expect(envVars).toContain('KB_*');

    const domains = result.network?.fetch ?? [];
    expect(domains).toContain('registry.npmjs.org');

    expect(result.quotas?.timeoutMs).toBe(300000);
  });

  it('should create commit-plugin with platform permissions (git + kb + llm + cache)', () => {
    const result = combine()
      .with(gitWorkflow)
      .with(kbPlatform)
      .withEnv(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'])
      .withFs({
        mode: 'readWrite',
        allow: ['.kb/commit/**'],
      })
      .withPlatform({
        llm: true,
        cache: ['git-status:'],
        analytics: true,
      })
      .withQuotas({
        timeoutMs: 600000,
        memoryMb: 512,
      })
      .build();

    // Env vars
    const envVars = result.env?.read ?? [];
    expect(envVars).toContain('HOME');
    expect(envVars).toContain('USER');
    expect(envVars).toContain('GIT_*');
    expect(envVars).toContain('KB_*');
    expect(envVars).toContain('OPENAI_API_KEY');
    expect(envVars).toContain('ANTHROPIC_API_KEY');

    // File system (runtime format)
    const read = result.fs?.read ?? [];
    const write = result.fs?.write ?? [];
    expect(read).toContain('**/.git/**');
    expect(read).toContain('.kb/**');
    expect(read).toContain('.kb/commit/**');
    expect(write).toContain('.kb/**');
    expect(write).toContain('.kb/commit/**');

    // Platform services
    expect(result.platform?.llm).toBe(true);
    expect(result.platform?.cache).toEqual(['git-status:']);
    expect(result.platform?.analytics).toBe(true);

    // Quotas
    expect(result.quotas?.timeoutMs).toBe(600000);
    expect(result.quotas?.memoryMb).toBe(512);
  });
});
