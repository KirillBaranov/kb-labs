/**
 * plugin:validate command - Validate plugin manifest and contracts
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { validateManifest, type ManifestV3 } from '@kb-labs/plugin-contracts';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginValidateFlags = {
  manifest: { type: 'string'; description?: string; default?: string };
  contracts: { type: 'string'; description?: string };
  fix: { type: 'boolean'; description?: string };
};

type PluginValidateResult = CommandResult & {
  valid?: boolean;
  errors?: Array<{ path: string; message: string }>;
  warnings?: string[];
};

/**
 * Validate manifest against contracts
 */
async function validateManifestAgainstContracts(
  manifest: unknown,
  contractsPath: string
): Promise<{ ok: boolean; issues: string[] }> {
  try {
    // Dynamic import of contracts
    const contractsModule = await import(path.resolve(contractsPath));
    const contracts = contractsModule.pluginContractsManifest || contractsModule.default;

    if (!contracts) {
      return { ok: false, issues: ['Contracts file does not export pluginContractsManifest'] };
    }

    const issues: string[] = [];

    // Check artifact IDs
    if (typeof manifest === 'object' && manifest !== null && 'artifacts' in manifest) {
      const manifestArtifacts = (manifest as { artifacts?: Array<{ id: string }> }).artifacts || [];
      const contractArtifacts = contracts.artifacts || {};

      for (const artifact of manifestArtifacts) {
        if (!(artifact.id in contractArtifacts)) {
          issues.push(`Artifact ID "${artifact.id}" not found in contracts`);
        }
      }
    }

    // Check command IDs
    if (typeof manifest === 'object' && manifest !== null && 'cli' in manifest) {
      const cli = (manifest as { cli?: { commands?: Array<{ id: string }> } }).cli;
      const manifestCommands = cli?.commands || [];
      const contractCommands = contracts.commands || {};

      for (const cmd of manifestCommands) {
        if (!(cmd.id in contractCommands)) {
          issues.push(`Command ID "${cmd.id}" not found in contracts`);
        }
      }
    }

    return { ok: issues.length === 0, issues };
  } catch (error) {
    return {
      ok: false,
      issues: [`Failed to load contracts: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export const pluginValidate = defineSystemCommand<PluginValidateFlags, PluginValidateResult>({
  name: 'plugin:validate',
  description: 'Validate plugin manifest and contracts',
  category: 'marketplace',
  flags: {
    manifest: {
      type: 'string',
      description: 'Path to manifest file (default: manifest.v2.ts)',
      default: 'manifest.v2.ts',
    },
    contracts: {
      type: 'string',
      description: 'Path to contracts file for cross-validation',
    },
    fix: {
      type: 'boolean',
      description: 'Automatically fix common issues',
    },
  },
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);
    const manifestPath = path.resolve(cwd, flags.manifest || 'manifest.v2.ts');

    ctx.ui.write(`Validating manifest: ${manifestPath}\n`);

    // Read and parse manifest
    let manifestContent: string;
    try {
      manifestContent = await fs.readFile(manifestPath, 'utf-8');
    } catch (error) {
      ctx.ui.error(`Failed to read manifest: ${error instanceof Error ? error.message : String(error)}\n`);
      return { ok: false };
    }

    // Try to import manifest (for TypeScript files)
    let manifest: unknown;
    try {
      // Remove .ts extension and import
      const modulePath = manifestPath.replace(/\.ts$/, '');
      const manifestModule = await import(modulePath);
      manifest = manifestModule.manifest || manifestModule.default;
    } catch (error) {
      // Fallback to JSON parsing
      try {
        manifest = JSON.parse(manifestContent);
      } catch (_jsonError) {
        ctx.ui.error(`Failed to parse manifest: ${error instanceof Error ? error.message : String(error)}\n`);
        return { ok: false };
      }
    }

    // Validate manifest structure
    const validationResult = validateManifest(manifest as ManifestV3);

    if (!validationResult.valid) {
      ctx.ui.error('❌ Manifest validation failed:\n');
      for (const msg of validationResult.errors) {
        ctx.ui.write(`  - ${msg}\n`);
      }
      return { ok: false, valid: false, errors: validationResult.errors.map((msg) => ({ path: '', message: msg })) };
    }

    ctx.ui.success('✅ Manifest structure is valid!\n');

    // Cross-validation with contracts
    if (flags.contracts) {
      const contractsPath = path.resolve(cwd, flags.contracts);
      ctx.ui.write(`\nValidating against contracts: ${contractsPath}\n`);

      const crossValidation = await validateManifestAgainstContracts(manifest, contractsPath);

      if (!crossValidation.ok) {
        ctx.ui.error('❌ Manifest does not match contracts:\n');
        for (const issue of crossValidation.issues) {
          ctx.ui.write(`  - ${issue}\n`);
        }
        return { ok: false, valid: false, errors: crossValidation.issues.map((issue) => ({
          path: '',
          message: issue,
        })) };
      }

      ctx.ui.success('✅ Manifest matches contracts!\n');
    }

    ctx.ui.success('\n✅ All validations passed!\n');
    return { ok: true, valid: true };
  },
});

