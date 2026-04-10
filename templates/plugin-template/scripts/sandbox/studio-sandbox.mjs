#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../../packages/plugin-cli/dist');
const entryPath = path.join(distDir, 'studio/widgets/hello-widget.js');

async function ensureBundle() {
  try {
    await access(entryPath, constants.R_OK);
  } catch {
    console.error('Build artifacts missing. Run `pnpm --filter @kb-labs/plugin-template-cli run build` first.');
    process.exit(1);
  }
}

async function main() {
  await ensureBundle();

  const [, , nameArg] = process.argv;
  const target = nameArg ?? 'Studio';
  const message = `Hello, ${target}!`;

  const moduleUrl = pathToFileURL(entryPath).href;
  const { HelloWidget } = await import(moduleUrl);
  const markup = renderToStaticMarkup(React.createElement(HelloWidget, { message, target }));

  console.info('Rendered widget markup:\\n');
  console.info(markup);
}

main().catch((err) => {
  console.error('Studio sandbox failed', err);
  process.exit(1);
});


