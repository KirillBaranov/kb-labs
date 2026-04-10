import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  pageExtensions: ['ts', 'tsx', 'mdx'],
  transpilePackages: [],
  outputFileTracingRoot: path.join(currentDir, '../../'),
};

export default nextConfig;
