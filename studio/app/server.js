#!/usr/bin/env node
/**
 * Studio static server — serves built SPA from dist/.
 * All routes fall back to index.html (SPA routing).
 *
 * Runtime config is injected into index.html so the same bundle works in any
 * environment without rebuilding. Set env vars to configure the SPA:
 *
 *   KB_API_BASE_URL   – API gateway URL  (default: http://localhost:4000/api/v1)
 *   KB_GATEWAY_TOKEN  – optional auth token for the gateway
 *   KB_EVENTS_BASE_URL – SSE/events base URL (defaults to KB_API_BASE_URL)
 *   PORT              – Studio server port   (default: 3000)
 *
 * In production, put nginx/ALB/Cloudflare in front — they handle proxying.
 * This server only serves static files.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT ?? 3000);

// Runtime config — values come from the process environment.
// null values are omitted so the SPA falls back to its own defaults.
const runtimeConfig = Object.fromEntries(
  Object.entries({
    KB_API_BASE_URL:   process.env.KB_API_BASE_URL   ?? `http://localhost:4000/api/v1`,
    KB_GATEWAY_TOKEN:  process.env.KB_GATEWAY_TOKEN  ?? undefined,
    KB_EVENTS_BASE_URL: process.env.KB_EVENTS_BASE_URL ?? undefined,
    KB_EVENTS_AUTH_TOKEN: process.env.KB_EVENTS_AUTH_TOKEN ?? undefined,
  }).filter(([, v]) => v !== undefined)
);

const configScript = `<script>window.__KB_STUDIO_CONFIG__ = ${JSON.stringify(runtimeConfig)};</script>`;

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
    const ext = extname(filePath);
    const mime = MIME[ext] ?? 'application/octet-stream';
    const isHtml = ext === '.html';
    const cache = isHtml ? 'no-cache' : 'public, max-age=31536000, immutable';

    if (isHtml) {
      // Inject runtime config before </head> so it's available when the bundle runs
      const html = (await readFile(filePath, 'utf-8')).replace('</head>', `${configScript}</head>`);
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cache });
      res.end(html);
    } else {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cache });
      res.end(data);
    }
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Studio  http://localhost:${PORT}`);
  console.log(`API     ${runtimeConfig.KB_API_BASE_URL}`);
});
