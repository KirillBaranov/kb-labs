import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  pageExtensions: ['ts', 'tsx', 'mdx'],
  transpilePackages: [],
  outputFileTracingRoot: process.env.NEXT_TRACING_ROOT ?? path.join(currentDir, '../../'),
};

export default nextConfig;
