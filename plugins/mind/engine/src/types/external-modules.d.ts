declare module '@kb-labs/mind-vector-store' {
  export class MindVectorStore {
    constructor(options: { indexDir: string });
    replaceScope(scopeId: string, chunks: any[]): Promise<void>;
    search(scopeId: string, vector: any, limit: number, filters?: any): Promise<any[]>;
  }
}
