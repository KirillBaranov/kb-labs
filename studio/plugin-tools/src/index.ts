/**
 * @kb-labs/studio-plugin-tools
 *
 * Build tooling for plugin Studio pages (Module Federation remotes).
 * Uses Rspack with @module-federation/enhanced for native MF support.
 *
 * @example
 * ```typescript
 * // rspack.studio.config.ts
 * const { createStudioRemoteConfig } = require('@kb-labs/studio-plugin-tools');
 *
 * module.exports = createStudioRemoteConfig({
 *   name: 'commitPlugin',
 *   exposes: {
 *     './CommitOverview': './src/studio/pages/CommitOverview.tsx',
 *   },
 * });
 * ```
 */

/**
 * Shared dependencies that match the Studio host.
 * Loaded once by the host — remotes reuse them via MF shared scope.
 */
export const STUDIO_SHARED_DEPS: Record<string, { singleton: boolean; requiredVersion: string }> = {
  react: { singleton: true, requiredVersion: '^18.3.0' },
  'react-dom': { singleton: true, requiredVersion: '^18.3.0' },
  'react-router-dom': { singleton: true, requiredVersion: '^7.0.0' },
  antd: { singleton: true, requiredVersion: '^5.21.0' },
  '@ant-design/icons': { singleton: true, requiredVersion: '^5.4.0' },
  '@tanstack/react-query': { singleton: true, requiredVersion: '^5.0.0' },
  zustand: { singleton: true, requiredVersion: '^5.0.0' },
  '@kb-labs/studio-hooks': { singleton: true, requiredVersion: '^0.1.0' },
  '@kb-labs/studio-event-bus': { singleton: true, requiredVersion: '^0.1.0' },
  '@kb-labs/studio-ui-kit': { singleton: true, requiredVersion: '^0.1.0' },
  '@kb-labs/studio-ui-core': { singleton: true, requiredVersion: '^0.1.0' },
  '@kb-labs/sdk': { singleton: true, requiredVersion: '^0.1.0' },
};

export interface KbStudioRemoteOptions {
  /** Module Federation remote name (must match manifest remoteName) */
  name: string;
  /** Exposed modules: { './PageName': './src/studio/pages/PageName.tsx' } */
  exposes: Record<string, string>;
  /** Override or extend shared deps */
  shared?: Record<string, { singleton?: boolean; requiredVersion?: string }>;
  /** Remote entry filename (default: 'remoteEntry.js') */
  filename?: string;
  /** Output directory (default: 'dist/widgets') */
  outputDir?: string;
}

/**
 * Create a complete Rspack config for building a plugin as an MF remote.
 *
 * Returns a full rspack config object — use as default export in rspack.config.mjs.
 * Uses dynamic import internally to avoid CJS/ESM issues.
 */
/**
 * Validate React version in the calling plugin's node_modules.
 * Studio host uses React 18 — React 19 causes MF element type mismatch at runtime.
 */
async function validateReactVersion(resolve: (id: string) => string): Promise<void> {
  const fs = await import('fs');

  const reactVersion = await (async (): Promise<string | null> => {
    try {
      const reactPkgPath = resolve('react/package.json');
      const reactPkg = JSON.parse(fs.readFileSync(reactPkgPath, 'utf8')) as { version: string };
      return reactPkg.version ?? null;
    } catch {
      return null;
    }
  })();

  if (!reactVersion) {return;}

  const majorStr = reactVersion.split('.').at(0) ?? '0';
  const major = parseInt(majorStr, 10);
  if (major >= 19) {
    throw new Error(
      `\n\n❌ Studio plugin build failed: React ${reactVersion} detected.\n\n` +
      `Studio host runs React 18. When a plugin bundles React 19, elements use\n` +
      `Symbol.for('react.transitional.element') which React 18 cannot reconcile,\n` +
      `causing "Objects are not valid as a React child" crash at runtime.\n\n` +
      `Fix: pin React 18 in your plugin's devDependencies:\n\n` +
      `  "devDependencies": {\n` +
      `    "react": "^18.3.1",\n` +
      `    "react-dom": "^18.3.1"\n` +
      `  }\n\n` +
      `Then reinstall and rebuild:\n\n` +
      `  pnpm install\n` +
      `  pnpm build:studio\n`,
    );
  }
}

export async function createStudioRemoteConfig(options: KbStudioRemoteOptions): Promise<Record<string, unknown>> {
  const { ModuleFederationPlugin } = await import('@module-federation/enhanced/rspack');
  const path = await import('path');
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);

  await validateReactVersion(require.resolve);

  const outputDir = options.outputDir ?? 'dist/widgets';

  return {
    entry: {},
    output: {
      path: path.resolve(process.cwd(), outputDir),
      publicPath: 'auto',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: { syntax: 'typescript', tsx: true },
                transform: { react: { runtime: 'automatic' } },
              },
            },
          },
        },
        {
          test: /\.module\.css$/,
          use: [
            require.resolve('style-loader'),
            { loader: require.resolve('css-loader'), options: { modules: true } },
          ],
        },
        {
          test: /\.css$/,
          exclude: /\.module\.css$/,
          use: [require.resolve('style-loader'), require.resolve('css-loader')],
        },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: options.name,
        filename: options.filename ?? 'remoteEntry.js',
        exposes: options.exposes,
        shared: {
          ...STUDIO_SHARED_DEPS,
          ...options.shared,
        },
      }),
    ],
    optimization: {
      minimize: true,
    },
  };
}
