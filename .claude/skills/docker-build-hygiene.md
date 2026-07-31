---
name: docker-build-hygiene
description: Guardrails before running docker build/run in this repo — prevents oversized build contexts and unpruned disk usage
globs:
  - "**/Dockerfile*"
  - "**/docker-compose*.yml"
  - "e2e/deploy/**"
  - ".dockerignore"
---

# Docker Build Hygiene

Full policy: `docs/deployment/docker-build-hygiene.md`. Written after a local
session filled a 228GB disk to 100% and corrupted Docker Desktop's storage —
root cause was a missing `.dockerignore` shipping the whole repo (22GB, with
`.claude/worktrees` alone at 11GB) as build context.

Before running `docker build` or `docker run` in this repo:

1. **Check `df -h` first.** Low free space → say so and ask before building,
   don't build anyway.
2. **Confirm `.dockerignore` exists at repo root** before a `context: .`
   build. It should — this skill exists because it was missing once.
3. **Tag test/fixture images distinctly** and clean them up when done
   (`trap 'docker rmi ...' EXIT` or equivalent) — see
   `e2e/deploy/config-override/test.sh` for the pattern.
4. **After iterating on a Dockerfile or a killed/interrupted build**, run
   `docker builder prune -f` — don't assume state is clean.
5. **`docker system df`/`docker images` failing with `input/output error`**
   means storage corruption, not disk pressure — freeing space won't fix it;
   flag it, don't keep retrying builds against a corrupted daemon.
