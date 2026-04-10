/**
 * @module @kb-labs/studio-data-client/mocks/mock-platform-source
 * Mock implementation of PlatformDataSource for development
 */

import type { PlatformDataSource } from '../sources/platform-source';
import type { PlatformConfigPayload } from '@kb-labs/rest-api-contracts';

/**
 * Mock platform data source
 */
export class MockPlatformSource implements PlatformDataSource {
  async getConfig(): Promise<PlatformConfigPayload> {
    return {
      schema: 'kb.platform.config/1',
      ts: new Date().toISOString(),
      adapters: {
        // Multi-adapter example: array of providers for LLM
        llm: ['@kb-labs/adapters-openai', '@kb-labs/adapters-vibeproxy'],
        embeddings: '@kb-labs/adapters-openai/embeddings',
        storage: '@kb-labs/adapters-fs',
        logger: '@kb-labs/adapters-pino',
        analytics: '@kb-labs/adapters-analytics-file',
        vectorStore: '@kb-labs/adapters-qdrant',
        cache: '@kb-labs/adapters-redis',
      },
      adapterOptions: {
        llm: {
          defaultModel: 'gpt-4o-mini',
        },
        vectorStore: {
          url: 'http://localhost:6333',
        },
        cache: {
          url: 'redis://localhost:6379',
        },
      },
      execution: {
        mode: 'in-process',
      },
      redacted: [],
    };
  }
}
