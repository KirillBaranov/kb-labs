import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  pageExtensions: ['ts', 'tsx', 'mdx'],
  transpilePackages: ['@kb-labs/web-i18n', '@kb-labs/web-data-source'],
  outputFileTracingRoot: path.join(currentDir, '../../../'),
  // Ensure middleware is included in standalone output
  outputFileTracingIncludes: {
    '/': ['./middleware.ts'],
  },
};

export default withNextIntl(nextConfig);
