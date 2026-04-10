const OPENAI_API = 'https://api.openai.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, OPENAI_API);

    const headers = new Headers(request.headers);
    headers.set('host', 'api.openai.com');

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
