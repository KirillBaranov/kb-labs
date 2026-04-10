# KB Labs CLI Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **KB Labs CLI**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

KB Labs CLI is the UX layer over the KB Labs platform. Documentation should focus on:

- Command reference and usage examples
- Plugin discovery and command registration
- CLI output formatting standards
- Integration with other KB Labs projects

## Project Documentation Structure

```
docs/
├── README.md                    # Documentation index
├── DOCUMENTATION.md             # This standard (REQUIRED)
├── ARCHITECTURE.md              # System architecture
├── COMMAND_QUICK_REFERENCE.md   # Quick command reference
├── COMMAND_REGISTRATION.md      # Command registration guide
├── DEVLINK_COMMANDS.md          # DevLink command documentation
├── guides/                      # Detailed guides
│   ├── CLI-STYLE.md             # CLI design principles
│   ├── COMMAND-OUTPUT.md        # Output formatting guide
│   └── PLUGIN-COMMAND-TEMPLATE.md  # Plugin command template
├── plugins/                     # Plugin integration docs
│   ├── ANALYTICS.md
│   ├── DEBUGGING.md
│   └── VSCODE-DEBUGGING.md
└── adr/                         # Architecture Decision Records
    ├── 0000-template.md
    └── *.md
```

## Required Documentation

This project requires:

- [x] `README.md` in root with all required sections
- [x] `CONTRIBUTING.md` in root with development guidelines
- [x] `docs/DOCUMENTATION.md` (this file)
- [x] `LICENSE` in root

## ADR Requirements

All ADRs must follow the format defined in the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md#architecture-decision-records-adr) with:

- Required metadata: Date, Status, Deciders, Last Reviewed, Tags
- Minimum 1 tag, maximum 5 tags
- Tags from approved list

## Cross-Linking

This project links to:

**Dependencies:**
- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) — Core utilities and platform abstractions
- [@kb-labs/plugin](https://github.com/KirillBaranov/kb-labs-plugin) — Plugin execution infrastructure
- [@kb-labs/shared](https://github.com/KirillBaranov/kb-labs-shared) — Shared utilities and types

**Used By:**
- [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) — Web UI
- All KB Labs plugins (register commands via CLI)

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) — Main ecosystem repository

---

**Last Updated:** 2026-02-24
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)
