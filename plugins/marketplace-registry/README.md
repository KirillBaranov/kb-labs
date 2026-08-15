# @kb-labs/marketplace-registry

> Marketplace Registry — publish, share, and manage plugins in KB Labs Registry.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-marketplace%20%7C%20registry%20%7C%20publish-lightgrey)

---

## Overview

Marketplace Registry is the publisher-facing counterpart to the Marketplace
plugin. While Marketplace handles install/update for consumers, Registry gives
plugin authors the tools to publish new versions, share private plugins, yank
broken releases, and manage deprecation — all backed by the Registry daemon
(`:5071`).

---

## Features

- Publish plugins to KB Labs Registry
- Share private plugins with a link or specific users
- Yank a specific version without fully unpublishing
- Deprecate packages with a custom message
- Registry daemon for self-hosted deployments

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Environment variables**

| Variable | Required | Description |
|----------|----------|-------------|
| `KB_REGISTRY_TOKEN` | Yes (publish) | Registry auth token |
| `KB_REGISTRY_AUTHOR_HANDLE` | Yes (publish) | Your author handle |
| `KB_REGISTRY_URL` | No | Override registry URL |
| `KB_GATEWAY_URL` | No | Override gateway URL |

**Registry daemon port:** `:5071` (depends on `state-daemon`)

---

## Installation

```bash
pnpm kb marketplace install @kb-labs/marketplace-registry-entry
```

---

## Commands

```bash
kb hub publish                  # publish current plugin to registry
kb hub share --with user123     # share private plugin with a user
kb hub share --link             # generate shareable link
kb hub yank --version 1.2.3    # yank a broken version
kb hub deprecate --message "Use @kb-labs/new-plugin instead"
```

**Full command reference**

| Command | Description |
|---------|-------------|
| `kb hub publish` | Publish plugin to KB Labs Registry |
| `kb hub share` | Share a private plugin |
| `kb hub yank` | Yank a specific version |
| `kb hub deprecate` | Deprecate a package |

---

## Permissions

| Category | Scope | Reason |
|----------|-------|--------|
| Environment | `KB_REGISTRY_TOKEN`, `KB_REGISTRY_AUTHOR_HANDLE`, `KB_REGISTRY_URL`, `KB_GATEWAY_URL` | Auth and routing |

---

## Changelog

### 1.0.0

- Initial release: publish, share, yank, deprecate commands + Registry daemon

---

## License

MIT
