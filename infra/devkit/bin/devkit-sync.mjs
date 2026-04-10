#!/usr/bin/env node
import { run } from '../sync/index.mjs';

(async () => {
  try {
    const code = await run({ args: process.argv.slice(2) });
    process.exit(typeof code === 'number' ? code : 0);
  } catch (e) {
    console.error('[devkit-sync]', e?.message || e);
    process.exit(1);
  }
})();
