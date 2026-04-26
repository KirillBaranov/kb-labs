declare module '@kb-labs/mind-vector-store' {
  export class MindVectorStore {
    constructor(options: { indexDir: string });
    replaceScope(scopeId: string, chunks: Record<string, unknown>[]): Promise<void>;
    search(scopeId: string, vector: number[], limit: number, filters?: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  }
}
