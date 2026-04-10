/**
 * @module @kb-labs/sdk/studio-build
 *
 * Build-time tooling for Studio plugin pages — single import for plugin authors
 * writing their rspack Module Federation config.
 *
 * This entry is **build-time only**. Do not import it from plugin runtime code
 * (inside React components or handlers). The underlying package pulls in
 * `@module-federation/enhanced` and `@rspack/core`, which are fine in a build
 * context but have no business being in your page bundle.
 *
 * @example
 * ```js
 * // rspack.studio.config.mjs
 * import { createStudioRemoteConfig } from '@kb-labs/sdk/studio-build';
 *
 * export default await createStudioRemoteConfig({
 *   name: 'commitPlugin',
 *   exposes: {
 *     './CommitOverview': './src/studio/pages/CommitOverview.tsx',
 *   },
 * });
 * ```
 */

export {
  createStudioRemoteConfig,
  STUDIO_SHARED_DEPS,
  type KbStudioRemoteOptions,
} from '@kb-labs/studio-plugin-tools';
