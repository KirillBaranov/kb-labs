#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../../packages/plugin-cli/dist');
const entryPath = path.join(distDir, 'rest/handlers/hello-handler.js');

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
  const name = nameArg ?? 'Sandbox';

  const moduleUrl = pathToFileURL(entryPath).href;
  const { handleHello } = await import(moduleUrl);
  const response = await handleHello({ name }, { runtime: { log: console.log } });

  console.info('REST response:', response);
}

main().catch((err) => {
  console.error('REST sandbox failed', err);
  process.exit(1);
});


