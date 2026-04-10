# KB Labs REST API Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **KB Labs REST API**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

KB Labs REST API provides a plugin-powered HTTP gateway for the KB Labs platform. Documentation should focus on:

- REST API endpoints and contracts
- Plugin discovery and dynamic route mounting
- Server-Sent Events (SSE) for real-time registry updates
- Security, CORS, and rate limiting configuration
- Integration examples and deployment

## Project Documentation Structure

```
docs/
├── DOCUMENTATION.md       # This standard (REQUIRED)
├── ARCHITECTURE.md        # System architecture
├── EXAMPLES.md            # API usage examples
├── DOCKER.md              # Docker deployment guide
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

## Optional Documentation

This project has:

- [x] `docs/architecture.md` - System architecture
- [x] `docs/examples.md` - API examples
- [x] `docs/docker.md` - Docker guide
- [ ] `docs/security.md` - Security policy (recommended for public API)
- [ ] `docs/api/README.md` - API reference index

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
- [@kb-labs/api-contracts](https://github.com/KirillBaranov/kb-labs-api-contracts) - API contracts

**Used By:**
- [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) - Web UI

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

---

**Last Updated:** 2026-02-24
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)



