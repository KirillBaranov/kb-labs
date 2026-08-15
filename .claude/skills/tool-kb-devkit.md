---
name: tool-kb-devkit
description: kb-devkit workspace orchestration: build, affected checks, health, and Docker bundle generation.
globs:
  - "tools/kb-devkit/**"
  - "devkit.yaml"
---

# kb-devkit

Use this tool for workspace-wide work; it preserves package build order and cache.

```bash
kb-devkit run build
kb-devkit run build --affected
kb-devkit run build lint type-check test --affected
kb-devkit health
kb-devkit bundle <package> --docker
```

- Never replace it with `pnpm -r run build`; declaration files can be built in the wrong order.
- `--affected` starts from Git changes and includes reverse dependants. Use a package-level command when the task is deliberately isolated.
- Use `--no-cache` only when diagnosing cache behavior; use `--json` when another program consumes the output.
- `devkit.yaml` categories and presets are shared build policy. Extend explicit task/check entries only when the task requires it.
