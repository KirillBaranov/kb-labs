# @kb-labs/mind

> AI-powered semantic code search and RAG for codebase understanding.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-search%20%7C%20rag%20%7C%20ai%20%7C%20semantic-lightgrey)

---

## Overview

Mind indexes your codebase into a vector store and lets you query it in natural
language. Hybrid BM25 + embedding search finds relevant code even when you don't
know the exact function name. The RAG engine is also used internally by other
KB Labs plugins (commit, review, agents) for context-aware analysis.

---

## Features

- Hybrid search — BM25 keyword + vector embedding in one query
- Incremental indexing — only re-indexes changed files
- Agent-powered query orchestration — multi-step reasoning over results
- Anti-hallucination verification — results are grounded in actual source files
- Sync API — add, update, delete individual documents without full re-index
- Auto-index cron — background hourly indexing (opt-in)
- Supports local Qdrant or Qdrant Cloud

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Platform services**

| Service | Required | Purpose |
|---------|----------|---------|
| `llm` | Required | Query orchestration |
| `embeddings` | Required | Vector generation |
| `vectorStore` | Required | Index storage (Qdrant) |
| `cache` | Required | Query result cache |
| `storage` | Required | Artifact storage |
| `analytics` | Optional | Usage tracking |

**Environment variables**

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes* | OpenAI embeddings/LLM (*or via platform adapter) |
| `QDRANT_URL` | Yes* | Qdrant instance URL (*or via platform adapter) |
| `QDRANT_API_KEY` | No | Qdrant Cloud API key |
| `EMBEDDING_PROVIDER` | No | Override embedding provider |
| `VECTOR_STORE_TYPE` | No | Override vector store type |

---

## Installation

```bash
pnpm kb marketplace install @kb-labs/mind-entry
```

---

## Commands

### Setup

```bash
kb mind init          # initialize mind workspace (.kb/mind/)
kb mind verify        # verify workspace + index consistency
```

### Indexing

```bash
kb mind rag-index     # build / rebuild the full index
```

### Querying

```bash
kb mind rag-query --text "how does auth work"
kb mind rag-query --text "where is the LLM called" --agent   # multi-step reasoning
```

### Document sync (incremental updates)

```bash
kb mind sync-add    --path src/new-file.ts
kb mind sync-update --path src/changed-file.ts
kb mind sync-delete --path src/removed-file.ts
kb mind sync-list                                  # list synced documents
kb mind sync-status                                # show sync health
```

**Full command reference**

| Command | Description |
|---------|-------------|
| `kb mind init` | Initialize mind workspace |
| `kb mind verify` | Verify workspace and index consistency |
| `kb mind rag-index` | Build or rebuild the RAG index |
| `kb mind rag-query` | Run a semantic query |
| `kb mind sync-add` | Add a document to sync |
| `kb mind sync-update` | Update a synced document |
| `kb mind sync-delete` | Delete a synced document |
| `kb mind sync-list` | List all synced documents |
| `kb mind sync-status` | Show sync status |

---

## Configuration

```jsonc
{
  "mind": {
    "indexing": {
      "include": ["**/*.ts", "**/*.tsx", "**/*.md"],
      "exclude": ["**/node_modules/**", "**/dist/**"]
    },
    "autoIndex": {
      "enabled": false,
      "schedule": "0 * * * *"
    }
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `indexing.include` | `string[]` | `['**/*.ts', '**/*.md', ...]` | File globs to index |
| `indexing.exclude` | `string[]` | `['**/node_modules/**', ...]` | File globs to skip |
| `autoIndex.enabled` | `boolean` | `false` | Enable hourly background indexing |
| `autoIndex.schedule` | `string` | `0 * * * *` | Cron expression for auto-index |

---

## Permissions

| Category | Scope | Reason |
|----------|-------|--------|
| Filesystem (rw) | `.kb/mind/**`, `.kb/cache/**` | Index and cache storage |
| Filesystem (r) | `**/*.ts`, `**/*.md`, `**/*.js`, etc. | Source file indexing |
| Network | `api.openai.com`, `*.qdrant.io`, `localhost:6333` | Embeddings + vector store |
| Environment | `OPENAI_API_KEY`, `QDRANT_*`, etc. | Service credentials |
| Platform | `llm`, `embeddings`, `vectorStore`, `cache`, `storage`, `analytics` | Core functionality |
| Quotas | 20 min timeout, 4 GB RAM, 10 min CPU | Large codebase indexing |

---

## Artifacts

| Path | Description |
|------|-------------|
| `.kb/mind/index/index.json` | Index metadata (chunks, files, revision) |
| `.kb/cache/mind-*.json` | Query result cache |

---

## Changelog

### 0.1.0

- Initial release: `rag-index`, `rag-query`, `init`, `verify`, sync commands

---

## License

MIT
