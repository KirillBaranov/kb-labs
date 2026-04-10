/**
 * Typed VectorStore proxy — wraps Platform API calls with VectorStore-specific types.
 */
export class VectorStoreProxy {
  constructor(private readonly call: <T>(adapter: string, method: string, ...args: unknown[]) => Promise<T>) {}

  async search(query: Record<string, unknown>): Promise<unknown[]> {
    return this.call<unknown[]>('vectorStore', 'search', query);
  }

  async upsert(documents: unknown[]): Promise<void> {
    await this.call<void>('vectorStore', 'upsert', documents);
  }

  async delete(ids: string[]): Promise<void> {
    await this.call<void>('vectorStore', 'delete', ids);
  }

  async count(): Promise<number> {
    return this.call<number>('vectorStore', 'count');
  }
}
