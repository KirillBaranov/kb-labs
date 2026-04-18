import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from '@rspack/cli';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import { HtmlRspackPlugin } from '@rspack/core';
import RefreshPlugin from '@rspack/plugin-react-refresh';
import { STUDIO_SHARED_DEPS } from '@kb-labs/studio-plugin-tools';

const isDev = process.env.NODE_ENV !== 'production';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gateway URL for proxying API and plugin widget requests
const proxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:4000';

// Expose KB_* env vars via import.meta.env
const envDefines = {
  'import.meta.env.MODE': JSON.stringify(isDev ? 'development' : 'production'),
  'import.meta.env.DEV': JSON.stringify(isDev),
  'import.meta.env.PROD': JSON.stringify(!isDev),
};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('KB_') && value !== undefined) {
    envDefines[`import.meta.env.${key}`] = JSON.stringify(value);
  }
}

export default defineConfig({
  experiments: {
    css: true,
  },
  entry: { main: './src/main.tsx' },
  output: {
    path: path.resolve(__dirname, 'dist'),
    publicPath: 'auto',
    filename: isDev ? '[name].js' : '[name].[contenthash:8].js',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@kb-labs/studio-ui-core': path.resolve(__dirname, '../ui-core/src'),
      '@kb-labs/studio-data-client': path.resolve(__dirname, '../data-client/src'),
    },
  },
  module: {
    parser: {
      'css/auto': {
        namedExports: false,
      },
      css: {
        namedExports: false,
      },
    },
    generator: {
      'css/auto': {
        exportsOnly: false,
        exportsConvention: 'as-is',
      },
      css: {
        exportsOnly: false,
        exportsConvention: 'as-is',
      },
    },
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: { syntax: 'typescript', tsx: true },
              transform: { react: { runtime: 'automatic', development: isDev, refresh: isDev } },
            },
          },
        },
      },
      {
        test: /\.css$/,
        use: ['postcss-loader'],
        type: 'css/auto',
      },
      {
        test: /\.(png|jpe?g|gif|svg|woff2?|eot|ttf|otf)$/,
        type: 'asset',
      },
    ],
  },
  plugins: [
    new HtmlRspackPlugin({
      template: './index.html',
      favicon: './public/favicon.svg',
    }),
    new ModuleFederationPlugin({
      name: 'studioHost',
      manifest: true,
      dts: isDev ? { consumeTypes: true } : false,
      remotes: {},
      shared: Object.fromEntries(
        Object.entries(STUDIO_SHARED_DEPS).map(([key, val]) => [key, { ...val, eager: true }]),
      ),
    }),
    isDev && new RefreshPlugin(),
  ].filter(Boolean),
  devServer: {
    port: 3000,
    hot: true,
    historyApiFallback: true,
    proxy: [
      { context: ['/api'], target: proxyTarget, changeOrigin: true },
      { context: ['/plugins'], target: proxyTarget, changeOrigin: true },
    ],
  },
  builtins: {
    define: envDefines,
  },
  devtool: isDev ? 'source-map' : 'source-map',
});
