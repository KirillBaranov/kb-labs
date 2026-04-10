# KB Labs Studio Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **KB Labs Studio**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

KB Labs Studio is a React-based web application that serves as the central dashboard for the KB Labs ecosystem. Documentation should emphasize:
- Web UI patterns and component usage
- Data layer integration (TanStack Query, API contracts)
- Theme system and design tokens
- Mock-first development approach

## Project Documentation Structure

```
docs/
├── README.md              # Documentation index (optional)
├── DOCUMENTATION.md       # This standard (REQUIRED)
├── adr/                   # Architecture Decision Records
│   ├── 0000-template.md  # ADR template
│   └── *.md               # ADR files
└── guides/                # Detailed guides (optional)
    └── *.md
```

## Required Documentation

This project requires:

- [x] `README.md` in root with all required sections
- [x] `CONTRIBUTING.md` in root with development guidelines
- [x] `docs/DOCUMENTATION.md` (this file)
- [x] `docs/adr/0000-template.md` (ADR template)
- [x] `LICENSE` in root

## Optional Documentation

Consider adding:

- [ ] `docs/guides/ui-components.md` - UI component usage guide
- [ ] `docs/guides/data-layer.md` - Data fetching patterns
- [ ] `docs/guides/theme-system.md` - Theme system documentation
- [ ] `docs/guides/mock-data.md` - Mock data setup and usage

## ADR Requirements

All ADRs must follow the format defined in the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md#architecture-decision-records-adr) with:

- Required metadata: Date, Status, Deciders, Last Reviewed, Tags
- Minimum 1 tag, maximum 5 tags
- Tags from approved list
- See `docs/adr/0000-template.md` for template

## Cross-Linking

This project links to:

**Dependencies:**
- [@kb-labs/api-contracts](https://github.com/KirillBaranov/kb-labs-api-contracts) - API contracts and schemas
- [@kb-labs/rest-api](https://github.com/KirillBaranov/kb-labs-rest-api) - REST API backend

**Used By:**
- All KB Labs ecosystem users (web dashboard)

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

---

**Last Updated:** 2025-11-03  
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)



