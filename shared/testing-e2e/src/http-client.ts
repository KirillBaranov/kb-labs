/**
 * Minimal HTTP client wrapper used by e2e tests.
 *
 * Intentionally thin — tests should be able to read one line and know
 * exactly what request went out. No retries, no interceptors, no magic.
 */

export interface HttpClientOptions {
  /** Extra headers included on every request. */
  headers?: Record<string, string>;
  /** Per-request timeout in ms. Default 15_000. */
  timeoutMs?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  /** Parsed JSON body, or `undefined` if the response had no body / non-JSON content. */
  body: T | undefined;
  /** Raw text body, always populated. */
  text: string;
}

export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly defaults: HttpClientOptions = {},
  ) {}

  async get<T = unknown>(path: string, opts: HttpClientOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, undefined, opts);
  }

  async post<T = unknown>(
    path: string,
    body: unknown,
    opts: HttpClientOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body, opts);
  }

  async delete<T = unknown>(
    path: string,
    opts: HttpClientOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, undefined, opts);
  }

  async put<T = unknown>(
    path: string,
    body: unknown,
    opts: HttpClientOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, body, opts);
  }

  async options<T = unknown>(
    path: string,
    opts: HttpClientOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>('OPTIONS', path, undefined, opts);
  }

  /** Build an absolute URL for a path under this client's base. */
  url(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {return path;}
    return `${this.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    opts: HttpClientOptions,
  ): Promise<HttpResponse<T>> {
    const timeoutMs = opts.timeoutMs ?? this.defaults.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      ...this.defaults.headers,
      ...opts.headers,
    };
    if (body !== undefined && !headers['content-type'] && !headers['Content-Type']) {
      headers['content-type'] = 'application/json';
    }

    try {
      const res = await fetch(this.url(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed: T | undefined;
      const contentType = res.headers.get('content-type') ?? '';
      if (text && contentType.includes('json')) {
        try {
          parsed = JSON.parse(text) as T;
        } catch {
          parsed = undefined;
        }
      }
      return {
        status: res.status,
        ok: res.ok,
        headers: res.headers,
        body: parsed,
        text,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function httpClient(baseUrl: string, opts: HttpClientOptions = {}): HttpClient {
  return new HttpClient(baseUrl, opts);
}
