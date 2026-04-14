import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  pageExtensions: ['ts', 'tsx', 'mdx'],
  transpilePackages: ['@kb-labs/web-i18n', '@kb-labs/web-data-source'],
  experimental: {
    outputFileTracingRoot: process.env.NEXT_TRACING_ROOT ?? path.join(currentDir, '../../'),
    outputFileTracingIncludes: {
      '/': ['./middleware.ts'],
    },
  },
};

export default withNextIntl(nextConfig);
