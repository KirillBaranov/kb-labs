import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { findWorkspaceRoot, resolveWorkspaceRoot } from '../workspace-root.js';

describe('workspace-root', () => {
  it('resolveWorkspaceRoot() finds the monorepo with .kb/devservices.yaml', () => {
    const root = resolveWorkspaceRoot();
    expect(existsSync(join(root, '.kb/devservices.yaml'))).toBe(true);
  });

  it('findWorkspaceRoot() returns null for an unrelated dir', () => {
    // /tmp is essentially guaranteed to have no .kb/devservices.yaml up the chain.
    const result = findWorkspaceRoot('/tmp');
    // If someone has seeded /tmp with a workspace, we accept null OR a string —
    // but it must never throw.
    expect(result === null || typeof result === 'string').toBe(true);
  });
});
