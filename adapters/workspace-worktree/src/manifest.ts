import type { AdapterManifest } from '@kb-labs/core-platform';

export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'worktree-workspace-provider',
  name: 'Git Worktree Workspace Provider',
  version: '0.1.0',
  description: 'Creates isolated git worktrees for pipeline execution',
  author: 'KB Labs Team',
  license: 'KBPL-1.1',
  type: 'core',
  implements: 'IWorkspaceProvider',
  contexts: ['workspace'],
  capabilities: {
    custom: {
      provider: 'worktree',
      isolation: true,
      gitSubmodules: true,
    },
  },
  configSchema: {
    worktreeDir: {
      type: 'string',
      default: '.worktrees',
      description: 'Directory where worktrees are created (relative to repo root)',
    },
    branch: {
      type: 'string',
      default: 'main',
      description: 'Default branch to create worktrees from',
    },
    initSubmodules: {
      type: 'boolean',
      default: true,
      description: 'Initialize git submodules in worktree',
    },
  },
};
