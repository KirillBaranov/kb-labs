#!/usr/bin/env node
import { resolve } from 'node:path';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';

async function tryApi(args) {
  try {
    const mod = await import('@kb-labs/devkit/sync');
    if (typeof mod.run === 'function') {
      const code = await mod.run({ args });
      if (typeof code === 'number' && code !== 0) process.exit(code);
      return true;
    }
  } catch { }
  return false;
}

async function tryBin(args) {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'kb-devkit-sync.cmd' : 'kb-devkit-sync';
  const binPath = resolve(process.cwd(), 'node_modules', '.bin', binName);
  try { await access(binPath); } catch { return false; }

  await new Promise((res, rej) => {
    const cp = spawn(binPath, args, { stdio: 'inherit', shell: false });
    cp.on('close', (code) => (code === 0 ? res() : rej(Object.assign(new Error('sync failed'), { code }))));
  });
  return true;
}

(async () => {
  const args = process.argv.slice(2);
  if (await tryApi(args)) process.exit(0);
  if (await tryBin(args)) process.exit(0);
  console.error('[devkit-sync] DevKit is not installed. Add @kb-labs/devkit to devDependencies.');
  process.exit(1);
})();