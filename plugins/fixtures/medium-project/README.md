# @test/medium-project (Mind fixture)

Medium complexity TypeScript project used as a fixture for KB Labs Mind.

## Purpose

This fixture represents a **moderate-sized project** with multiple services, utilities, and documentation.  
It is used to test:

- multi-layer indexing,
- richer dependency graphs, and
- interaction with docs/ADR content.

## Structure

```
fixtures/medium-project/
├── docs/
│   └── adr/
│       ├── 0001-architecture.md
│       └── 0002-dependencies.md
├── src/
│   ├── index.ts
│   ├── services/
│   │   ├── core.ts
│   │   └── processor.ts
│   └── utils/
│       ├── config.ts
│       └── helper.ts
└── tsconfig.json
```

## Notes

- Used by Mind tests to validate indexing of services, utils, and ADRs.
- Safe to evolve alongside test scenarios, but keep dependencies light.


