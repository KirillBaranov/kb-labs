#!/usr/bin/env node
/**
 * Studio static server — serves built SPA from dist/
 * All routes fall back to index.html (SPA routing).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

const server = createServer(async (req, res) => {
  // Strip query string
  const url = req.url.split('?')[0];

  // Prevent path traversal
  const safePath = resolve(DIST, '.' + url);
  if (!safePath.startsWith(DIST)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  let filePath = safePath;

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // File not found → SPA fallback
    filePath = join(DIST, 'index.html');
  }

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    const mime = MIME[ext] ?? 'application/octet-stream';

    // index.html: no cache; assets with hash: immutable
    const isHtml = ext === '.html';
    const cache = isHtml
      ? 'no-cache'
      : 'public, max-age=31536000, immutable';

    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cache });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Studio running at http://localhost:${PORT}`);
});
