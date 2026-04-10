# KB Labs SDK Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **KB Labs SDK**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

KB Labs SDK is the official plugin development facade. Documentation should focus on:

- Plugin API usage (defineCommand, defineRoute, etc.)
- Platform helpers (useLogger, useCache, useLLM, etc.)
- Testing utilities
- Migration from internal packages

## Project Documentation Structure

```
docs/
├── DOCUMENTATION.md       # This standard (REQUIRED)
└── adr/                    # Architecture Decision Records
    ├── 0000-template.md   # ADR template
    └── *.md                # ADR files
```

## Required Documentation

This project requires:

- [x] `README.md` in root with all required sections
- [x] `CONTRIBUTING.md` in root with development guidelines
- [x] `docs/DOCUMENTATION.md` (this file)
- [x] `docs/adr/0000-template.md` (ADR template exists)
- [x] `LICENSE` in root

## Optional Documentation

Consider adding:

- [ ] `docs/glossary.md` - Template-specific terms
- [ ] `docs/examples.md` - Template usage examples
- [ ] `docs/faq.md` - Frequently asked questions

## ADR Requirements

All ADRs must follow the format defined in the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md#architecture-decision-records-adr) with:

- Required metadata: Date, Status, Deciders, Last Reviewed, Tags
- Minimum 1 tag, maximum 5 tags
- Tags from approved list
- See main standard `docs/templates/ADR.template.md` for template

## Cross-Linking

This project links to:

**Dependencies:**
- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Platform adapters and runtime
- [@kb-labs/shared](https://github.com/KirillBaranov/kb-labs-shared) - Command kit, CLI UI, tool kit
- [@kb-labs/plugin](https://github.com/KirillBaranov/kb-labs-plugin) - Plugin contracts

**Used By:**
- All KB Labs plugins

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

---

**Last Updated:** 2026-02-24
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)



