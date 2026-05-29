# @kb-labs/rest-api-core

Configuration loader and shared types for the KB Labs REST API runtime.

## Overview

Provides the Zod schema, loader, and environment variable mapping for `@kb-labs/rest-api-app`.
No business logic — pure configuration infrastructure.

## API Reference

- `loadRestApiConfig(options)` — load and validate REST API config from `kb-labs.config.json`
- `restApiConfigSchema` — Zod schema for REST API configuration
- `RestApiConfig` — TypeScript type for validated config

## Configuration

Loaded from `kb-labs.config.json` under the `restApi` key:

```json
{
  "restApi": {
    "port": 5050,
    "basePath": "/api/v1",
    "apiVersion": "1.0.0",
    "cors": {
      "origins": ["http://localhost:3000"],
      "profile": "dev"
    },
    "http2": {
      "enabled": false,
      "allowHTTP1": true
    }
  }
}
```

Environment variables (`KB_REST_*`) override file config — see root [README.md](../../README.md) for full list.

### HTTP/2

Enable HTTP/2 to remove the 6-connection browser limit (important for SSE):

```json
{
  "restApi": {
    "http2": { "enabled": true, "allowHTTP1": true },
    "ssl": { "keyPath": "ssl/server.key", "certPath": "ssl/server.cert" }
  }
}
```

Generate a self-signed cert for local development:

```bash
mkdir -p ssl
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout ssl/server.key -out ssl/server.cert \
  -days 365 -subj "/CN=localhost"
```

## Usage

```typescript
import { loadRestApiConfig } from '@kb-labs/rest-api-core';

const config = await loadRestApiConfig({ cwd: process.cwd() });
```

## License

KB Public License v1.1 © KB Labs
