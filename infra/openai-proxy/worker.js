const OPENAI_API = 'https://api.openai.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, OPENAI_API);

    const headers = new Headers(request.headers);
    headers.set('host', 'api.openai.com');
    // Inject API key from worker secret — client never sends it
    headers.set('Authorization', `Bearer ${env.OPENAI_API_KEY}`);
    // Strip IP-forwarding headers so OpenAI sees Cloudflare's IP, not the VPS IP
    headers.delete('cf-connecting-ip');
    headers.delete('x-forwarded-for');
    headers.delete('x-real-ip');
    headers.delete('true-client-ip');
    headers.delete('x-forwarded-host');
    headers.delete('x-original-forwarded-for');

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  },
};
