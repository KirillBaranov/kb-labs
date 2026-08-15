---
name: tool-release
description: KB Labs release workflow, release checks, and safe handoff to CI.
globs:
  - "plugins/release/**"
  - ".kb/kb.config.json"
  - ".kb/release/**"
---

# Release workflow

Releasing changes package versions, tags, Git history, and may trigger npm publication. Proceed only with explicit user approval.

## Normal agent path

1. Verify the checkout is the intended release branch and the workspace build is healthy.
2. Use the workflow daemon and run one named flow:

```bash
pnpm kb workflow run --workflow-id release-prepare --input '{"flow":"platform"}'
pnpm kb workflow runs status --run-id <runId>
```

Valid flows are configured in `.kb/kb.config.json` (normally `platform` and `sdk`). Never omit `flow`; platform and SDK are separate releases. The workflow pauses for approval before versions, tags, and pushes. Approve only after the user explicitly authorizes that exact action.

3. After a tag is pushed, CI owns package staging and publication. Inspect or rerun CI; do not publish manually.

## Prohibited shortcuts

- Do not run `pnpm publish`, `npm publish`, `pnpm -r publish`, manual `git tag`, or manual `git push` to simulate a release.
- Do not use a direct `release run --skip-checks` path.
- Do not remove release checks except for a documented one-release break-glass procedure explicitly approved by a human; restore the check immediately afterwards.

## Safe inspection

```bash
pnpm kb release plan --flow platform
pnpm kb release checks --flow platform
pnpm kb release run --flow platform --dry-run
```

`release:*:prepare` is fallback-only when the workflow daemon cannot be restored and the user has explicitly approved the exception. It prepares Git state without npm publication.
