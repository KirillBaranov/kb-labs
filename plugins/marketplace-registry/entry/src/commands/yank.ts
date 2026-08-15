import { defineCommand, handleError, validationError, type CLIInput, type PluginContextV3, type CommandResult } from '@kb-labs/sdk';
import { registryPost } from '../registry-http.js';

interface YankFlags {
  reason?: string;
  json?: boolean;
}

export default defineCommand<unknown, CLIInput<YankFlags>, unknown>({
  id: 'marketplace:yank',
  description: 'Yank a specific version (soft-remove — tarball stays, fresh installs blocked)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<YankFlags>): Promise<CommandResult> {
      const { flags = {}, argv = [] } = input;
      const [pkg, version] = argv;
      const t0 = Date.now();

      if (!pkg || !version) {
        validationError(ctx, 'Package spec and version are required', 'Usage: kb hub yank kb:handle/name <version>', flags.json);
        return { ok: false, error: 'Package spec and version are required' };
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
        await registryPost(`/packages/${handle}/${encodeURIComponent(name)}/${version}/yank`, { reason: flags.reason });

        if (flags.json) {
          ctx.ui?.json?.({ yanked: true, pkg, version });
          return { ok: true };
        }

        const items = [
          'Fresh installs of this version are blocked',
          'Existing installations continue to work',
        ];
        if (flags.reason) {
          items.push(`Reason: ${flags.reason}`);
        }

        ctx.ui?.success?.(`${pkg}@${version} yanked`, {
          sections: [{ header: 'What this means', items }],
          hint: 'To yank all versions, deprecate the package instead',
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
