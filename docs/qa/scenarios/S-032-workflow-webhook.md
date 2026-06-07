---
id: S-032
title: Workflow — Sends webhook on completion
persona: solo-developer
priority: P1
automation: manual
e2e: e2e/gateway/scenarios/default/cases/webhooks.spec.ts
---

## Goal
Workflow finishes and automatically notifies an external system.
Developer sets it up once and trusts it fires reliably.

## Prerequisites
- [ ] Platform running
- [ ] Webhook receiver available (netcat, requestbin, or similar)
- [ ] Workflow with `on.complete.webhook.url` configured

---

## Steps

### Phase 1 — Configure webhook

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Add to workflow YAML: `on: {complete: {webhook: {url: "http://localhost:9998"}}}` | Config accepted | Accepted — workflow discovered | ✅ |
| 2 | Run workflow to completion | Webhook fired | Run completed with `success` | ✅ |
| 3 | Webhook receiver gets payload | POST with `runId`, `status`, `workflow` | **Receiver got nothing — file empty** | ❌ |

### Phase 2 — Failure webhook

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `on.fail` fires on failure | Fires only on failure | Not tested — base webhook doesn't work | ⬜ |

### Phase 3 — Reliability

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | Webhook endpoint down | Retries with backoff | Not tested | ⬜ |
| 9 | Delivery visible in run detail | `"Webhook fired at X"` | Not visible in run response | ❌ |

---

## Result

**FAIL** — Webhook configured in YAML but not fired on completion.
Run completes with `success` but no HTTP request sent to configured URL.
Webhook feature either not implemented or config syntax is wrong.

## Bugs

| ID | Priority | Description |
|---|---|---|
| B-035 | P1 | `on.complete.webhook.url` in workflow YAML has no effect — webhook not sent on completion. Feature may not be implemented or config key is wrong. |

## Notes

- Tested: `on: {complete: {webhook: {url: "http://localhost:9998"}}}` — run completed successfully but webhook not fired.
- `e2e/gateway/scenarios/default/cases/webhooks.spec.ts` exists — may test a different webhook mechanism (gateway-level, not workflow YAML).
- Run date: 2026-06-05. Platform 2.94.0.
