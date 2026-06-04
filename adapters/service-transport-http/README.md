# @kb-labs/adapters-service-transport-http

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem.

HTTP/unix-socket implementation of `IServiceTransport` using undici connection pools. Platform-only adapter — never exposed to plugin context.

## Overview

| Property | Value |
|----------|-------|
| Interface | `IServiceTransport` |
| Backend | undici (HTTP + unix domain sockets) |
| Layer | Adapter (Layer 2) |
