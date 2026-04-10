# Contributing Guide

Thanks for helping grow the KB Labs plugin ecosystem!

---

## 🧰 Local development

```bash
pnpm install
pnpm --filter @kb-labs/plugin-template-cli run build # optional warm-up
pnpm --filter @kb-labs/plugin-template-cli test
```

Handy scripts:

- `pnpm verify` – lint + type-check + test
- `pnpm sandbox:cli|rest|studio` – run compiled artifacts in sandboxes
- `pnpm devkit:sync` – align configs with `@kb-labs/devkit`

## 📐 Engineering guidelines

### Layering

- `shared` → `domain` → `application` → `cli/rest/studio`
- Interface layers invoke application use-cases; keep them thin and deterministic.
- Application orchestrates domain objects and depends on infrastructure adapters via interfaces.
- Domain is pure (no fs/net/env access).

### Code quality

- Follow ESLint + Prettier (run `pnpm lint`).
- TypeScript is strict; add explicit types at module boundaries.
- Cover behaviour with Vitest (`packages/plugin-cli/tests/**`).
- Update docs and manifest comments when changing contracts.

### Manifest checklist

1. Register new commands/routes/widgets in `src/manifest.v2.ts`.
2. Declare permissions (fs/net/env/quotas) required by the feature.
3. Add entries to `tsup.config.ts` so outputs are bundled with d.ts files.
4. Provide tests, sandbox examples, and documentation updates.

### Conventional commits

```
feat: add greeting scheduler
fix: correct hello schema
docs: expand studio guide
refactor: split use-case logic
test: cover json output path
chore: bump devkit
```

---

## 🔄 Pull request workflow

Before opening a PR:

1. Branch off `main`.
2. Implement the change following layering + manifest guidelines.
3. Run `pnpm verify`.
4. Update docs (`README`, guides, ADRs) and sandbox scripts as needed.
5. Provide CLI transcripts or screenshots when appropriate.

PR requirements:

- Include tests proving behaviour (CLI/REST/Studio as applicable).
- Reference related issues or ADRs.
- Ensure CI is green and request maintainer review.

---

Documentation standards live in [`docs/DOCUMENTATION.md`](./docs/DOCUMENTATION.md). Capture major structural decisions with [`docs/adr/0000-template.md`](./docs/adr/0000-template.md).
