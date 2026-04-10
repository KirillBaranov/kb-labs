# sample-project (Mind fixture)

Small TypeScript project used as a fixture for testing KB Labs Mind indexing.

## Purpose

This fixture is a **minimal project** used in tests to verify:

- basic file discovery,
- simple dependency graphs, and
- token/size accounting in the Mind indexer.

It is not a production package and should not be published.

## Structure

```
fixtures/small-project/
├── src/
│   ├── index.ts
│   ├── types.ts
│   └── utils.ts
└── tsconfig.json
```

## Notes

- Kept intentionally small to make tests fast and deterministic.
- Safe to modify when extending Mind indexer tests, but avoid adding heavy dependencies.


