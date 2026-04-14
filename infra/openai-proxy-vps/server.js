import { createServer } from 'node:http';

const OPENAI_API = 'https://api.openai.com';
const PORT = process.env.PORT || 8080;

// OpenAI forward proxy (drop-in replacement for the old Cloudflare Worker).
// No auth — clients bring their own OpenAI Authorization header.
// We just strip identity headers and forward to api.openai.com from Helsinki egress.

const server = createServer(async (req, res) => {
  const target = new URL(req.url, OPENAI_API);

  const headers = { ...req.headers };
  delete headers['host'];
  delete headers['connection'];
  delete headers['content-length'];
  delete headers['x-forwarded-for'];
  delete headers['x-real-ip'];
  delete headers['x-forwarded-host'];
  delete headers['cf-connecting-ip'];
  delete headers['true-client-ip'];
  delete headers['x-original-forwarded-for'];
  headers['host'] = 'api.openai.com';

  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      duplex: 'half',
    });

    const respHeaders = Object.fromEntries(response.headers);
    delete respHeaders['transfer-encoding'];
    delete respHeaders['content-encoding'];
    res.writeHead(response.status, respHeaders);

    if (!response.body) { res.end(); return; }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'proxy error', message: err.message }));
  }
});

server.listen(PORT, () => console.log(`openai proxy listening on :${PORT}`));
