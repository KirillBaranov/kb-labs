# KB Labs Plugin System Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **KB Labs Plugin System**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

KB Labs Plugin System provides the sandboxed plugin execution infrastructure. Documentation should focus on:

- Plugin manifest format (V3) and contract types
- Runtime context structure (`PluginContextV3`) and available APIs
- Execution backends and their trade-offs (in-process vs subprocess vs worker-pool)
- Plugin development workflow and testing

## Project Documentation Structure

```
docs/
├── DOCUMENTATION.md       # This standard (REQUIRED)
└── adr/                   # Architecture Decision Records
    ├── 0000-template.md   # ADR template
    └── *.md               # ADR files
```

## Required Documentation

This project requires:

- [x] `README.md` in root with all required sections
- [x] `CONTRIBUTING.md` in root with development guidelines
- [x] `docs/DOCUMENTATION.md` (this file)
- [x] `docs/adr/0000-template.md` (ADR template exists)
- [x] `LICENSE` in root

## ADR Requirements

All ADRs must follow the format defined in the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md#architecture-decision-records-adr) with:

- Required metadata: Date, Status, Deciders, Last Reviewed, Tags
- Minimum 1 tag, maximum 5 tags
- Tags from approved list
- See main standard `docs/templates/ADR.template.md` for template

## Cross-Linking

This project links to:

**Dependencies:**
- [@kb-labs/core-platform](https://github.com/KirillBaranov/kb-labs-core) — Platform adapters
- [@kb-labs/core-ipc](https://github.com/KirillBaranov/kb-labs-core) — IPC transport

**Used By:**
- [kb-labs-cli](https://github.com/KirillBaranov/kb-labs-cli) — CLI plugin execution
- [kb-labs-rest-api](https://github.com/KirillBaranov/kb-labs-rest-api) — REST plugin mounting
- [kb-labs-workflow](https://github.com/KirillBaranov/kb-labs-workflow) — Workflow step execution

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) — Main ecosystem repository

---

**Last Updated:** 2026-02-24
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)
