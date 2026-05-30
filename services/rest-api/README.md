# rest-api

> Platform REST API daemon — hosts all plugin routes and serves the OpenAPI spec.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-rest%20%7C%20api%20%7C%20openapi%20%7C%20infrastructure-lightgrey)

---

## Overview

REST API is the platform HTTP daemon that discovers and mounts routes registered
by installed plugins. Every route declared in a plugin manifest under `rest` is
served here. It also generates and serves the aggregated OpenAPI specification
for all active plugins.

---

## Features

- Auto-discovers and mounts plugin REST routes
- Aggregated OpenAPI spec at `/api/v1/openapi.json`
- Health check at `/api/v1/health`
- Depends on Qdrant for vector-store-backed plugins (mind, etc.)
- All traffic reaches plugins via Gateway `:4000`

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Depends on:** Qdrant (vector store)

**Port:** `:5050`

---

## Usage

REST API is a platform service — it starts automatically with `kb-dev start`.

```bash
kb-dev start         # starts rest-api + all dependencies
kb-dev status        # verify rest-api is running
```

Health check: `GET http://localhost:5050/api/v1/health`

OpenAPI spec: `GET http://localhost:5050/api/v1/openapi.json`

---

## Changelog

### 1.2.0

- Plugin route auto-discovery
- OpenAPI aggregation

---

## License

MIT
