# KB Labs Threat Model

Last updated: 2026-06-06

## Scope

This document covers attack vectors that cannot be caught by automated scanners
and require periodic manual review. Automated coverage is in `.github/workflows/security.yml`.

## Automated coverage (CI)

| Vector | Tool | Schedule |
|--------|------|----------|
| CVE in npm dependencies | `pnpm audit` | daily + on push to main |
| CVE in Go dependencies | `govulncheck` | daily + on push to main |
| Secrets in code / git history | `gitleaks` | daily + on push to main |
| Injection patterns (TS/JS/Go) | Semgrep | daily + on push to main |
| Info disclosure in HTTP responses | Semgrep (custom) | daily + on push to main |

## Manual review vectors

### 1. Auth bypass — gateway loopback guardrail

**Risk:** `auth.enabled = false` is allowed when the request originates from loopback.
If loopback detection relies on `X-Forwarded-For`, `X-Real-IP`, or similar headers
it can be spoofed by an external client, effectively disabling auth for the entire gateway.

**What to check:**
- `plugins/gateway/` — how loopback is detected; must use the actual socket peer address, not headers
- Ensure `X-Forwarded-For` and `X-Real-IP` cannot override the peer address check
- Test: send a request with `X-Forwarded-For: 127.0.0.1` from an external IP; auth must still be enforced

**Cadence:** review whenever gateway auth logic changes.

---

### 2. Plugin sandbox escape — governance middleware

**Risk:** Plugins receive a `platform` object scoped by governance middleware
(`applyPluginGovernance`). If the middleware is bypassed or misconfigured, a plugin
can access adapters (logger, cache, eventbus, storage) belonging to other plugins
or to the system itself.

**What to check:**
- `core/plugin-runtime/src/platform/` — `applyPluginGovernance` applies to ALL adapters in `ADAPTER_REGISTRY`
- No adapter is handed to a plugin without going through governance
- Plugin cannot obtain a reference to the raw (pre-governance) platform object
- EventBus: plugin cannot subscribe to events scoped to another plugin's namespace
- Test: create a minimal plugin, attempt to call an adapter method that should be forbidden by its permission set; expect rejection

**Cadence:** review whenever a new adapter is added to `ADAPTER_REGISTRY` or governance pipeline changes.

---

## Out of scope (for now)

- Prompt injection via workflow/agent inputs — low exploitability until remote execution is public
- SSRF via gateway proxy — no open proxy routes at this stage; revisit when gateway routing expands
