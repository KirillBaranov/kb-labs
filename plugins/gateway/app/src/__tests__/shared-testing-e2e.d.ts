declare module '@kb-labs/shared-testing-e2e' {
  interface HttpResponse<T = unknown> { status: number; body?: T; headers: Record<string, string> }
  interface HttpClient {
    get<T = unknown>(path: string, options?: any): Promise<HttpResponse<T>>;
    post<T = unknown>(path: string, body?: any, options?: any): Promise<HttpResponse<T>>;
    put<T = unknown>(path: string, body?: any, options?: any): Promise<HttpResponse<T>>;
    patch<T = unknown>(path: string, body?: any, options?: any): Promise<HttpResponse<T>>;
    delete<T = unknown>(path: string, options?: any): Promise<HttpResponse<T>>;
    ws(path: string, options?: any): any;
  }
  export const KbDevController: any;
  export function httpClient(baseUrl: string, options?: any): HttpClient;
  export { HttpClient };
  export function registerAgent(client: HttpClient, options?: any): Promise<any>;
  export function registerHost(client: HttpClient, options?: any): Promise<any>;
  export function waitForReady(controller: any): Promise<void>;
  export function createTestClient(options?: any): HttpClient;
}
