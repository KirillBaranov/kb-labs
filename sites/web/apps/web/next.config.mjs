import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';
import createMDX from '@next/mdx';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
const withMDX = createMDX({});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  pageExtensions: ['ts', 'tsx', 'mdx'],
  transpilePackages: [
    '@kb-labs/web-i18n',
    '@kb-labs/web-data-source',
    '@kb-labs/web-site-tokens',
    '@kb-labs/web-site-ui',
  ],
  outputFileTracingRoot: process.env.NEXT_TRACING_ROOT ?? path.join(currentDir, '../../'),
  outputFileTracingIncludes: {
    '/': ['./middleware.ts'],
  },
};

export default withNextIntl(withMDX(nextConfig));

