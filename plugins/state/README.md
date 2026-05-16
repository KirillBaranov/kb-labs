# state

> Distributed state management daemon for KB Labs platform services.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-state%20%7C%20distributed%20%7C%20infrastructure-lightgrey)

---

## Overview

State Daemon is a platform infrastructure service (`:7777`) that provides
distributed state management via HTTP (State Broker). Platform services use it
to share state across processes without direct coupling.

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Port:** `:7777`

---

## Usage

State Daemon is a platform service — it starts automatically with `kb-dev start`.

```bash
kb-dev start         # starts state daemon + all platform services
kb-dev status        # verify state-daemon is running
```

Health check: `GET http://localhost:7777/health`

---

## Changelog

### 1.4.0

- State Broker HTTP server

---

## License

MIT
