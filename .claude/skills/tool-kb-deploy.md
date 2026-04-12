---
name: tool-kb-deploy
description: kb-deploy — build and deploy sites/services to remote server via Docker
globs:
  - "tools/kb-deploy/**"
  - "sites/**"
---

# kb-deploy — Deploy Tool

Go binary that builds Docker images and deploys configured targets to the remote server.

## Commands

```bash
kb-deploy list                  # list configured deploy targets
kb-deploy status                # show last deployed SHA per target
kb-deploy run                   # deploy affected targets (git diff HEAD~1)
kb-deploy run --all             # deploy all targets
kb-deploy run <target>          # deploy a specific target by name
```

## Workflow

1. Run `kb-deploy list` to see configured targets and confirm what will be deployed
2. Run `kb-deploy status` to see last deployed SHA per target
3. Run `kb-deploy run --all` or `kb-deploy run <target>` to deploy

## Usage

Binary is at `tools/kb-deploy/kb-deploy`. Run from repo root:

```bash
./tools/kb-deploy/kb-deploy <command>
```

## Important

- Always run `list` first to confirm targets before deploying
- Use `status` after deploy to verify the new SHA landed
- `run` without flags deploys only affected targets based on `git diff HEAD~1`
