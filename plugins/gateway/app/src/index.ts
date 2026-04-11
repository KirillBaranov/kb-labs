import { bootstrap } from './bootstrap.js';

// process.cwd() = workspace root when launched via `node ./infra/kb-labs-gateway/.../dist/index.js`
bootstrap(process.cwd()).catch((error) => {
  console.error('Failed to start gateway:', error);
  process.exit(1);
});
