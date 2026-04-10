import type { PermissionPreset } from '../types';

/**
 * Vector Store preset - for plugins that use vector databases
 * Includes Qdrant, Pinecone, Weaviate access
 */
export const vectorStore: PermissionPreset = {
  id: 'vector-store',
  description: 'Vector database access - Qdrant, Pinecone, Weaviate',
  permissions: {
    env: {
      read: [
        // Qdrant
        'QDRANT_URL',
        'QDRANT_API_KEY',
        'QDRANT_*',
        // Pinecone
        'PINECONE_API_KEY',
        'PINECONE_ENVIRONMENT',
        'PINECONE_*',
        // Weaviate
        'WEAVIATE_URL',
        'WEAVIATE_API_KEY',
        'WEAVIATE_*',
        // Generic
        'VECTOR_STORE_*',
        'EMBEDDING_*',
      ],
    },
    network: {
      fetch: [
        'localhost',
        '127.0.0.1',
        '*.qdrant.io',
        '*.pinecone.io',
        '*.weaviate.io',
      ],
    },
  },
};
