import { describe, it, expect } from 'vitest';
import semver from 'semver';
import { pluginContractsManifest } from '../src/contract';
import { parsePluginContracts } from '../src/schema';
import { contractsSchemaId, contractsVersion } from '../src/version';

describe('pluginContractsManifest', () => {
  it('matches the published schema', () => {
    expect(() => parsePluginContracts(pluginContractsManifest)).not.toThrow();
  });

  it('declares the expected schema identifier', () => {
    expect(pluginContractsManifest.schema).toBe(contractsSchemaId);
  });

  it('uses a valid SemVer contracts version', () => {
    expect(semver.valid(contractsVersion)).toBeTruthy();
  });
});
