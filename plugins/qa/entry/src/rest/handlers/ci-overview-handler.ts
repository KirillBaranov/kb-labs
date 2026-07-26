import { join } from 'node:path';
import { defineHandler, rethrowForRest, type PluginContextV3 } from '@kb-labs/sdk';
import { analyzeCiReliability, loadCiDossiers } from '@kb-labs/qa-core';

/** Read-only agent surface. It intentionally returns findings, not raw GitHub logs. */
export default defineHandler({
  async execute(ctx: PluginContextV3) {
    try {
      const cwd = ctx.cwd ?? process.cwd();
      return analyzeCiReliability(loadCiDossiers(join(cwd, '.kb/qa/ci/evidence')));
    } catch (error) {
      rethrowForRest(error);
    }
  },
});
