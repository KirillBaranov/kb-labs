import { describe, expect, it } from 'vitest';
import { findForbiddenDependencyProtocols } from '../verifier.js';

describe('findForbiddenDependencyProtocols', () => {
  it('rejects workspace-only protocols in every published dependency section', () => {
    const issues = findForbiddenDependencyProtocols({
      dependencies: { '@kb-labs/core': 'workspace:*' },
      optionalDependencies: { native: 'file:../native' },
      peerDependencies: { plugin: 'link:../plugin' },
    });

    expect(issues).toEqual([
      'dependencies.@kb-labs/core uses forbidden workspace: dependency protocol (workspace:*)',
      'optionalDependencies.native uses forbidden file: dependency protocol (file:../native)',
      'peerDependencies.plugin uses forbidden link: dependency protocol (link:../plugin)',
    ]);
  });

  it('accepts registry-compatible dependency ranges', () => {
    expect(findForbiddenDependencyProtocols({
      dependencies: { '@kb-labs/core': '^2.115.0', lodash: '4.17.21' },
      peerDependencies: { typescript: '>=5' },
    })).toEqual([]);
  });
});
