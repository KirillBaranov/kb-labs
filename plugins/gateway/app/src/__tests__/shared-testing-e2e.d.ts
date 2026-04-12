declare module '@kb-labs/shared-testing-e2e' {
  export const KbDevController: any;
  export const httpClient: any;
  export type HttpClient = any;
  export function registerAgent(client: any, options?: any): Promise<any>;
  export function registerHost(client: any, options?: any): Promise<any>;
  export function waitForReady(controller: any): Promise<void>;
  export function createTestClient(options?: any): any;
}
