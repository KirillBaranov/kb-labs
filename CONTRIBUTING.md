# Contributing Guide

Thanks for considering a contribution to **KB Labs** projects!  

---

## Development setup

```bash
pnpm i
pnpm dev
```

## Guidelines

- **Coding style**: follow ESLint + Prettier rules. Run `pnpm lint` before pushing.
- **Testing**: cover all changes with Vitest. Run `pnpm test`.
- **Commits**: use clear, conventional messages (e.g., `feat: add X`, `fix: correct Y`).
- **ADRs**: for architectural changes, add a new record in `docs/adr`.

---

## Pull requests

1. Fork the repo and create a feature branch.
2. Make your changes.
3. Run `pnpm check` (lint + type-check + tests).
4. Submit a PR with a clear description of your changes.