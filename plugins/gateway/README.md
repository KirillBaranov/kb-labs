# gateway

> Central API gateway — routes all HTTP traffic to KB Labs services.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-gateway%20%7C%20routing%20%7C%20auth%20%7C%20infrastructure-lightgrey)

---

## Overview

Gateway is the single HTTP entry point for the KB Labs platform. It aggregates
the REST API, Workflow, Marketplace, and any plugin-registered routes behind
port `:4000`. Every plugin that registers REST routes or WebSocket channels
requires Gateway to be running.

---

## Features

- Single entry point for all platform HTTP traffic
- Routes requests to REST API `:5050`, Workflow `:7778`, Marketplace `:5070`
- Authentication middleware for registered routes
- Required dependency for all REST API and Studio plugins

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Depends on:** `rest-api`, `workflow`

**Port:** `:4000`

---

## Usage

Gateway is a platform service — it starts automatically with `kb-dev start` and
does not need to be installed separately.

```bash
kb-dev start         # starts gateway + all dependent services
kb-dev status        # verify gateway is running
```

Health check: `GET http://localhost:4000/health`

---

## Configuration

```jsonc
{
  "platform": {
    "adapterOptions": {
      "environment": {
        "gateway": {
          "url": "http://localhost:4000",
          "internalSecret": "..."
        }
      }
    }
  }
}
```

---

## Changelog

### 1.0.0

- Initial release

---

## License

MIT
