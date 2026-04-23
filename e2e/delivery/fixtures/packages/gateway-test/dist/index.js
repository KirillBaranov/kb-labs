// Minimal stub HTTP server used by the delivery e2e.
// Listens on $PORT (default 4000) and answers GET /health with 200/"ok".
// Intentionally dependency-free so pnpm install is fast and offline-safe.
'use strict';

const http = require('http');

const port = parseInt(process.env.PORT || '4000', 10);
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`gateway-test listening on :${port}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
