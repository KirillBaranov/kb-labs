# KB Labs DevLink Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **KB Labs DevLink**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

KB Labs DevLink is a developer linker and ecosystem orchestrator for KB Labs. Documentation should focus on:

- Local package linking with Yalc
- Version sync and publishing
- Multi-repository workflows
- Watch mode and operations workflow

## Project Documentation Structure

```
docs/
├── DOCUMENTATION.md       # This standard (REQUIRED)
├── WATCH.md                # Watch mode documentation
├── OPERATIONS_WORKFLOW.md  # Operations workflow guide
└── adr/                    # Architecture Decision Records (if applicable)
    ├── 0000-template.md   # ADR template
    └── *.md                # ADR files
```

## Required Documentation

This project requires:

- [x] `README.md` in root with all required sections
- [x] `CONTRIBUTING.md` in root with development guidelines
- [x] `docs/DOCUMENTATION.md` (this file)
- [ ] `docs/adr/0000-template.md` (ADR template - should be created from main standard)
- [x] `LICENSE` in root

## Optional Documentation

This project has:

- [x] `docs/WATCH.md` - Watch mode documentation
- [x] `docs/OPERATIONS_WORKFLOW.md` - Operations workflow guide

## ADR Requirements

All ADRs must follow the format defined in the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md#architecture-decision-records-adr) with:

- Required metadata: Date, Status, Deciders, Last Reviewed, Tags
- Minimum 1 tag, maximum 5 tags
- Tags from approved list
- See main standard `docs/templates/ADR.template.md` for template

## Cross-Linking

This project links to:

**Dependencies:**
- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Core utilities

**Used By:**
- All KB Labs projects for local development linking

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

---

**Last Updated:** 2025-11-03  
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)



