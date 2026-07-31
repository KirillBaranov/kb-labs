# Docker Build Hygiene

Policy for anyone (human or agent) running `docker build`/`docker run` in this
repo, local machine or VPS. Written after a local session filled a 228GB disk
to 100% and corrupted Docker Desktop's containerd content store, root-caused
while building `e2e/deploy/config-override`'s fixture.

## What actually happened (read this before assuming "the container was huge")

The image itself was tiny (`node:22-slim` + a few KB of fixtures). The disk
was consumed by the **build context**, not the image:

- No `.dockerignore` existed at repo root. Every `docker build` using
  `context: .` (which is what every real Dockerfile in `.kb/deploy.yaml`
  uses) shipped the **entire repo** to the daemon before the build even
  started — 22GB on a long-lived local clone (`.claude/worktrees`: 11GB of
  duplicated agent-session checkouts; `node_modules`: 5.2GB across 98 dirs).
- Docker Desktop on macOS runs in a VM with its own virtual disk file. That
  file grows on every context transfer and cache write but **does not shrink
  on its own**, even after `docker system prune`. A few oversized/interrupted
  build attempts can inflate it by tens of GB that persist long after the
  data is logically gone.
- A killed mid-transfer build (from a stuck context upload) left the
  containerd content store with a missing blob — real corruption, not just
  disk pressure. `docker system df` / `docker images` started failing with
  `input/output error` until Docker Desktop was reset.

Fixed at the root: `.dockerignore` now exists at repo root (see it for the
exact exclusion list). This is the single biggest lever — it prevents the
oversized-context problem for every Dockerfile in the repo, not just test
fixtures.

## Rules

1. **Never `docker build` with a large/repo-root context without checking
   `.dockerignore` covers it first.** If context is `.` at repo root, confirm
   `.dockerignore` excludes `node_modules`, `.git`, `.claude/worktrees`,
   `dist` (except `.kb/deploy/**`), and `.kb/{database,storage,analytics,logs,tmp,cache}`.
   If you add a Dockerfile with a non-root context, prefer the smallest
   context that actually contains what's COPYed.
2. **Check disk space before a build session, not after.** `df -h /` (macOS)
   or `df -h` (Linux/VPS). Below ~10% free, stop and clean up before
   building — do not "try it anyway."
3. **Tag test/fixture images distinctly** (e.g. `-fixture` suffix) and clean
   them up when the test run ends — don't leave build artifacts for a "next
   time" that never comes. `e2e/deploy/config-override/test.sh` removes its
   own image on exit (`trap ... EXIT`); follow that pattern for any new
   Docker-based test script.
4. **Prune regularly — Docker never does this on its own.**
   - Local dev machine: `docker system prune -f` after a session that built
     images you don't need to keep; `docker builder prune -f` if you were
     iterating on a Dockerfile.
   - VPS: add a scheduled `docker system prune -af --volumes --filter
     "until=168h"` (weekly) rather than relying on manual cleanup — the VPS
     failure mode is different from the Desktop-VM one (real disk, no VM
     file to compact) but has the same root cause: old layers, old tags, and
     build cache nobody prunes.
5. **A killed/interrupted build is not "safe to ignore."** If a `docker
   build` is killed mid-transfer (stuck context upload, OOM, manual kill),
   run `docker builder prune -f` afterward — don't assume the daemon rolled
   back cleanly.
6. **If `docker system df` / `docker images` fail with `input/output
   error`**, that's storage corruption, not disk pressure — freeing space
   will not fix it. Restart Docker Desktop; if that doesn't clear it, use
   Docker Desktop's "Troubleshoot → Clean / Purge data" (macOS) or
   equivalent, which resets the VM disk.

## For agents

Before running any `docker build`/`docker run` in this repo:

- Confirm `.dockerignore` exists and is current (it should — this doc exists
  because it was missing once).
- Run `df -h` first; if free space is low, say so and ask before proceeding
  rather than building anyway.
- Clean up test/fixture images and build cache when the task is done, not
  "leave it for later."
