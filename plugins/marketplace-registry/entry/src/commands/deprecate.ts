import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { registryPost } from '../registry-http.js';

interface DeprecateFlags {
  message?: string;
  json?: boolean;
}

export default defineCommand<unknown, CLIInput<DeprecateFlags>, unknown>({
  id: 'marketplace:deprecate',
  description: 'Deprecate a package (removed from catalog, install shows warning)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<DeprecateFlags>): Promise<CommandResult> {
      const { flags = {}, argv = [] } = input;
      const pkg = argv[0];
      const t0 = Date.now();

      if (!pkg) {
        validationError(ctx, 'Package spec is required', 'Usage: kb hub deprecate kb:handle/name [--message "reason"]', flags.json);
        return { ok: false, error: 'Package spec is required' };
      }

      if (!pkg.startsWith('kb:')) {
        validationError(ctx, 'Package must be a kb: spec', 'Example: kb:kirill/my-plugin', flags.json);
        return { ok: false, error: 'Package must be a kb: spec' };
      }

      const sliced = pkg.slice(3);
      const slashIdx = sliced.indexOf('/');
      const handle = slashIdx > 0 ? sliced.slice(0, slashIdx) : '';
      const name = slashIdx > 0 ? sliced.slice(slashIdx + 1) : '';
      if (!handle || !name) {
        validationError(ctx, 'Invalid kb: spec — expected kb:handle/name', undefined, flags.json);
        return { ok: false, error: 'Invalid kb: spec' };
      }

      try {
        await registryPost(`/packages/${handle}/${encodeURIComponent(name)}/deprecate`, { message: flags.message });

        if (flags.json) {
          ctx.ui?.json?.({ deprecated: true, pkg });
          return { ok: true };
        }

        const items = [
          'Hidden from the marketplace catalog',
          'Existing installations still work but show a deprecation warning',
          'New installs are allowed but show a warning',
        ];
        if (flags.message) {
          items.push(`Message: ${flags.message}`);
        }

        ctx.ui?.success?.(`${pkg} deprecated`, {
          sections: [{ header: 'What this means', items }],
          hint: 'To block a specific version only, use kb hub yank instead',
          timing: Date.now() - t0,
        });

        return { ok: true };
      } catch (err) {
        handleError(ctx, err, flags.json);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
});
