# [Project Name] Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **[Project Name]**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

[Add any project-specific documentation requirements or deviations from the main standard here]

## Project Documentation Structure

```
docs/
├── README.md              # Documentation index (optional)
├── DOCUMENTATION.md       # This standard (REQUIRED)
├── glossary.md            # Project glossary (optional)
├── examples.md            # Usage examples (optional)
├── faq.md                 # Frequently asked questions (optional)
├── security.md            # Security policy (if applicable)
├── performance.md         # Performance best practices (if applicable)
├── adr/                   # Architecture Decision Records
│   ├── 0000-template.md  # ADR template
│   └── *.md               # ADR files
├── api/                   # API documentation (if applicable)
│   ├── README.md
│   └── *.md
└── guides/                # Detailed guides (optional)
    └── *.md
```

## Required Documentation

This project requires:

- [ ] `README.md` in root with all required sections
- [ ] `CONTRIBUTING.md` in root with development guidelines
- [ ] `docs/DOCUMENTATION.md` (this file)
- [ ] `docs/adr/0000-template.md` (ADR template)
- [ ] `LICENSE` in root

## Optional Documentation

Consider adding:

- [ ] `docs/glossary.md` - Project-specific terms
- [ ] `docs/examples.md` - Usage examples
- [ ] `docs/faq.md` - Frequently asked questions
- [ ] `MIGRATION_GUIDE.md` - For breaking changes
- [ ] `SECURITY.md` - For public APIs

## ADR Requirements

All ADRs must follow the format defined in the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md#architecture-decision-records-adr) with:

- Required metadata: Date, Status, Deciders, Last Reviewed, Tags
- Minimum 1 tag, maximum 5 tags
- Tags from approved list
- See `docs/adr/0000-template.md` for template

## Cross-Linking

This project links to:

**Dependencies:**
- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Core utilities
- [Other dependencies]

**Used By:**
- [Projects using this]

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

---

**Last Updated:** YYYY-MM-DD  
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)


