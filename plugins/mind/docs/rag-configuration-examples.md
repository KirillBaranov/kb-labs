# RAG Configuration Examples

This document provides practical examples of `kb.config.json` configurations for different use cases.

## Example 1: Production Setup with OpenAI and Qdrant

```json
{
  "knowledge": {
    "sources": [
      {
        "id": "codebase",
        "kind": "code",
        "language": "typescript",
        "paths": ["src/**/*.ts", "src/**/*.tsx"],
        "exclude": ["**/*.test.ts", "**/*.spec.ts"]
      },
      {
        "id": "docs",
        "kind": "docs",
        "paths": ["docs/**/*.md", "README.md"]
      }
    ],
    "scopes": [
      {
        "id": "full",
        "label": "Full Codebase",
        "sources": ["codebase", "docs"]
      }
    ],
    "engines": [
      {
        "id": "mind-prod",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "openai",
            "provider": {
              "openai": {
                "model": "text-embedding-3-small",
                "dimension": 1536,
                "batchSize": 100
              }
            }
          },
          "vectorStore": {
            "type": "qdrant",
            "qdrant": {
              "url": "${QDRANT_URL}",
              "apiKey": "${QDRANT_API_KEY}",
              "collectionName": "mind_prod",
              "dimension": 1536
            }
          },
          "chunk": {
            "codeLines": 150,
            "docLines": 100,
            "overlap": 25
          },
          "search": {
            "hybrid": true,
            "vectorWeight": 0.7,
            "keywordWeight": 0.3,
            "rrfK": 60,
            "reranking": {
              "type": "cross-encoder",
              "crossEncoder": {
                "model": "gpt-4o-mini"
              },
              "topK": 20
            },
            "optimization": {
              "deduplication": true,
              "deduplicationThreshold": 0.9,
              "diversification": true,
              "diversityThreshold": 0.3,
              "maxChunksPerFile": 3
            }
          }
        }
      }
    ]
  }
}
```

## Example 2: Local Development with Ollama

```json
{
  "knowledge": {
    "sources": [
      {
        "id": "code",
        "kind": "code",
        "language": "typescript",
        "paths": ["src/**/*.ts"]
      }
    ],
    "scopes": [
      {
        "id": "dev",
        "label": "Development",
        "sources": ["code"]
      }
    ],
    "engines": [
      {
        "id": "mind-local",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "local",
            "provider": {
              "local": {
                "type": "ollama",
                "model": "nomic-embed",
                "endpoint": "http://localhost:11434",
                "dimension": 768
              }
            }
          },
          "vectorStore": {
            "type": "local",
            "local": {
              "indexDir": ".kb/mind/local-index"
            }
          },
          "search": {
            "hybrid": true,
            "reranking": {
              "type": "heuristic"
            }
          }
        }
      }
    ]
  }
}
```

## Example 3: Minimal Configuration (Auto Mode)

```json
{
  "knowledge": {
    "sources": [
      {
        "id": "code",
        "kind": "code",
        "language": "typescript",
        "paths": ["src/**/*.ts"]
      }
    ],
    "scopes": [
      {
        "id": "default",
        "label": "Default",
        "sources": ["code"]
      }
    ],
    "engines": [
      {
        "id": "mind-auto",
        "type": "mind"
        // Uses defaults:
        // - embedding: auto (tries OpenAI, falls back to deterministic)
        // - vectorStore: auto (tries Qdrant, falls back to local)
        // - search: vector only, no reranking, optimization enabled
      }
    ]
  }
}
```

## Example 4: High-Performance Setup

```json
{
  "knowledge": {
    "sources": [
      {
        "id": "code",
        "kind": "code",
        "language": "typescript",
        "paths": ["src/**/*.ts"]
      }
    ],
    "scopes": [
      {
        "id": "perf",
        "label": "Performance",
        "sources": ["code"]
      }
    ],
    "engines": [
      {
        "id": "mind-perf",
        "type": "mind",
        "options": {
          "embedding": {
            "type": "openai",
            "provider": {
              "openai": {
                "model": "text-embedding-3-large",
                "dimension": 3072,
                "batchSize": 200
              }
            }
          },
          "vectorStore": {
            "type": "qdrant",
            "qdrant": {
              "url": "${QDRANT_URL}",
              "dimension": 3072
            }
          },
          "chunk": {
            "codeLines": 200,
            "docLines": 150
          },
          "search": {
            "hybrid": true,
            "vectorWeight": 0.8,
            "keywordWeight": 0.2,
            "rrfK": 60,
            "reranking": {
              "type": "cross-encoder",
              "topK": 30,
              "crossEncoder": {
                "model": "gpt-4o",
                "batchSize": 20
              }
            },
            "optimization": {
              "deduplication": true,
              "deduplicationThreshold": 0.95,
              "diversification": true,
              "diversityThreshold": 0.4,
              "maxChunksPerFile": 5,
              "adaptiveSelection": true,
              "avgTokensPerChunk": 250
            }
          }
        }
      }
    ]
  }
}
```

## Environment Variables

The following environment variables are supported:

- `OPENAI_API_KEY` - OpenAI API key for embeddings and re-ranking
- `QDRANT_URL` - Qdrant server URL (default: http://localhost:6333)
- `QDRANT_API_KEY` - Qdrant API key (for Qdrant Cloud)
- `EMBEDDING_PROVIDER` - Override embedding provider type (auto/openai/local/deterministic)
- `VECTOR_STORE_TYPE` - Override vector store type (auto/local/qdrant)

## Configuration Priority

Configuration is resolved in the following order (later overrides earlier):

1. Default values (built into the engine)
2. `kb.config.json` file configuration
3. Environment variables
4. Runtime overrides (if provided programmatically)






