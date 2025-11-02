# KB Labs Documentation Standard

> **Standard Version:** 1.0  
> **Last Updated:** 2025-01-28  
> **Applies To:** All KB Labs projects

This document defines the documentation standards for the KB Labs ecosystem. All projects in the ecosystem should follow these standards to ensure consistency, professionalism, and ease of navigation across the entire platform.

## Philosophy

KB Labs documentation follows these core principles:

1. **Professional OSS Level** - Documentation quality should match that of major open-source projects (React, TypeScript, Next.js)
2. **Consistency First** - All projects should have a similar structure and style
3. **Cross-Linking** - Projects should clearly reference each other to show ecosystem cohesion
4. **Discoverability** - Documentation should be easy to find, navigate, and search
5. **Maintainability** - Documentation structure should make updates easy and prevent drift
6. **Automation-Friendly** - Structure should support automated validation and generation

## Documentation Structure

### Root Level Files

**Required Files:**
- `README.md` - Main project entry point
- `CONTRIBUTING.md` - Contribution guidelines
- `LICENSE` - Project license
- `docs/DOCUMENTATION.md` - This standard (copy for project-specific customizations)

**Optional Files:**
- `MIGRATION_GUIDE.md` - Migration guides for breaking changes
- `SECURITY.md` - Security policy (for public APIs)
- `CODE_OF_CONDUCT.md` - Code of conduct (for public OSS)

**Note:** `CHANGELOG.md` is managed by `@kb-labs/release-manager` and should not be manually created.

### Documentation Directory Structure

```
docs/
├── README.md              # Documentation index (optional)
├── DOCUMENTATION.md       # This standard (REQUIRED)
├── glossary.md            # Glossary of terms (recommended for ecosystem)
├── examples.md            # Usage examples (recommended)
├── faq.md                 # Frequently asked questions (optional)
├── security.md            # Security policy (if applicable)
├── performance.md         # Performance best practices (if applicable)
├── adr/                   # Architecture Decision Records
│   ├── 0000-template.md  # ADR template
│   └── *.md               # ADR files
├── api/                   # API documentation (if applicable)
│   ├── README.md
│   └── *.md
├── guides/                # Detailed guides (optional)
│   └── *.md
└── ecosystem/             # Only for kb-labs meta-project
    ├── STATUS.md
    ├── DEPENDENCIES.md
    └── HEALTH.md
```

## README.md Structure

### Required Sections

1. **Title and Tagline** (1-2 sentences)
   - Clear project name
   - Brief description of what the project does

2. **Badges**
   - License (MIT)
   - Node.js version requirement
   - pnpm version requirement
   - Build status (if CI is set up)

3. **Vision/Overview**
   - 1-2 paragraphs describing project purpose and goals
   - How it fits into the KB Labs ecosystem

4. **Quick Start**
   - Installation command
   - Basic usage example
   - Link to detailed documentation

5. **Repository Structure**
   - Directory layout
   - Purpose of each major directory

6. **Available Scripts**
   - Table of pnpm commands
   - What each command does

7. **Requirements**
   - Node.js version (≥18.18.0)
   - pnpm version (≥9.0.0)
   - Any other dependencies

8. **License**
   - MIT License reference

### Optional Sections

- **Architecture** - For complex projects, describe system architecture
- **Features** - List of key features
- **Configuration** - How to configure the project
- **API Reference** - Link to `docs/api/` or inline examples
- **Examples** - Links to example files or `docs/examples.md`
- **Roadmap** - Link to roadmap if maintained
- **Related Packages** - Links to other KB Labs projects (see Cross-Linking section)
- **Contributing** - Link to `CONTRIBUTING.md`

### README Example Structure

```markdown
# Project Name

> Brief tagline describing what the project does

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## Vision

Project vision and goals...

## Quick Start

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Repository Structure

\`\`\`
packages/
├── core/
└── cli/
\`\`\`

## Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development mode |
| `pnpm build` | Build all packages |

## Related Packages

- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Core utilities
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

## License

MIT © KB Labs
```

## CONTRIBUTING.md Structure

### Required Sections

1. **Header with Thanks**
   - Welcome message for contributors

2. **Development Setup**
   - Installation steps
   - How to start development mode
   - Environment setup

3. **Development Guidelines**
   - **Code Style** - ESLint, Prettier rules
   - **Testing** - Vitest, coverage requirements
   - **Commit Messages** - Conventional Commits format
   - **Architecture Decisions** - Link to ADR process

4. **Pull Request Process**
   - Before submitting checklist
   - PR requirements
   - Review process

### Optional Sections

- **Package Boundaries** - For monorepos
- **Plugin Development** - If applicable
- **Testing Strategy** - Detailed testing approach
- **Code Review Guidelines** - Review standards
- **Release Process** - If non-standard

## Architecture Decision Records (ADR)

### ADR Format

All ADRs must follow this structure:

```markdown
# ADR-XXXX: [Brief Decision Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded
**Deciders:** KB Labs Team
**Last Reviewed:** YYYY-MM-DD
**Reviewers:** [Optional list]
**Tags:** [tag1, tag2, tag3]

## Context

Describe the problem or situation that necessitated this decision.
What alternatives were considered? What constraints exist?

## Decision

Describe the decision that was made. Key aspects: structure, tools, practices.
Include diagrams or schemas if applicable.

## Consequences

### Positive

- Benefits of the chosen solution

### Negative

- Drawbacks and risks

### Alternatives Considered

- Why other options were rejected

## Implementation

What changes after this decision is made? What processes or code need to be updated?
Will this decision be revisited in the future?

## References

- [Discussion / Pull Request](url)
- [Related ADRs](./0000-other-decision.md)
```

### ADR Metadata Requirements

**Required Fields:**
- `Date` - Creation date (YYYY-MM-DD)
- `Status` - One of: Proposed, Accepted, Deprecated, Superseded
- `Deciders` - Who made the decision
- `Last Reviewed` - Date of last review (YYYY-MM-DD)
- `Tags` - Array of tags (minimum 1, maximum 5)

**Optional Fields:**
- `Reviewers` - List of people who reviewed

### ADR Tags

Tags are **mandatory** for all ADRs. Use tags from this list:

- `architecture` - Architectural decisions (structure, layers, dependencies)
- `tooling` - Tooling decisions (build, lint, test tools)
- `process` - Development processes and workflow (CI/CD, review process)
- `security` - Security decisions (authentication, authorization, data protection)
- `performance` - Performance optimization (caching, optimization)
- `integration` - Integration with external systems (APIs, third-party services)
- `migration` - Migrations and updates (legacy code, breaking changes)
- `api` - API design (REST, GraphQL, contracts)
- `data` - Data handling (storage, serialization, validation)
- `testing` - Testing strategies (unit, integration, e2e)
- `deployment` - Deployment (containers, orchestration)
- `observability` - Monitoring and logging (metrics, tracing, logging)
- `ui/ux` - User interface and experience
- `cli` - CLI tools and commands
- `config` - Configuration and settings

### ADR Tag Validation

**Rules:**
- Minimum 1 tag, maximum 5 tags per ADR
- Tags must be from the approved list above
- `Last Reviewed` must be updated on each review
- AI agents should validate tags during generation
- CI/CD can check for missing or invalid tags

### ADR Template Location

Each project should have `docs/adr/0000-template.md` with the full template above.

## Cross-Linking Between Projects

### Link Rules

1. **External Links (Priority)**
   - Use external GitHub links for cross-project references
   - URL should come from `package.json.repository.url` or `package.json.homepage`
   - Format: `https://github.com/KirillBaranov/kb-labs-[project]/blob/main/path/to/file.md`

2. **Internal Links**
   - Use relative paths for files within the same repository
   - Format: `./docs/adr/0001-example.md` or `../packages/core/README.md`

3. **Fallback**
   - If repository URL is not in `package.json`, use relative paths as fallback

### Related Packages Section

Every README should include a "Related Packages" section:

```markdown
## Related Packages

### Dependencies
- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Core utilities
- [@kb-labs/shared](https://github.com/KirillBaranov/kb-labs-shared) - Shared types

### Used By
- [@kb-labs/rest-api](https://github.com/KirillBaranov/kb-labs-rest-api) - REST API layer
- [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) - Web UI

### Ecosystem
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository
```

## KB Labs Meta-Project Structure

The `kb-labs` repository is the **central hub** of the ecosystem. It serves as:

- **Ecosystem Overview** - Status of all projects
- **Budgeting & ROI Tracking** - AI budget and ROI metrics (see `docs/BUDGET.md`)
- **Roadmap** - Strategic plans (see `docs/roadmap/`)
- **Documentation Standards** - This document and templates
- **Wiki/Knowledge Base** - Centralized knowledge (future)

### Special Documentation for kb-labs

```
kb-labs/docs/
├── README.md                    # Documentation overview
├── DOCUMENTATION.md             # This standard (main)
├── BUDGET.md                    # Budgeting and ROI
├── glossary.md                  # Ecosystem glossary (recommended)
├── adr/                         # Ecosystem ADRs
├── roadmap/                     # Ecosystem roadmap
├── templates/                   # Documentation templates
│   ├── README.template.md
│   ├── CONTRIBUTING.template.md
│   ├── ADR.template.md
│   └── DOCUMENTATION.template.md
└── ecosystem/                   # Ecosystem status tracking
    ├── STATUS.md                # Project status (Active, Maintenance, Deprecated)
    ├── DEPENDENCIES.md          # Dependency graph
    └── HEALTH.md                # Project health metrics
```

## Optional Documentation Files

### Glossary (`docs/glossary.md`)

**Recommended for kb-labs ecosystem:**
- Common KB Labs terms (Profiles, ADRs, Contracts, etc.)
- Links to detailed documentation
- Helpful for onboarding

### Examples (`docs/examples.md`)

**Recommended:**
- Practical usage examples
- Integration patterns
- Links to demo applications

### FAQ (`docs/faq.md`)

**Optional:**
- Frequently asked questions
- Common troubleshooting
- Quick reference

### Migration Guides (`MIGRATION_GUIDE.md`)

**For projects with versioning:**
- Step-by-step migration between major versions
- Breaking changes documentation
- Before/after examples
- Migration checklist

### Security (`SECURITY.md` or `docs/security.md`)

**For public APIs:**
- Security policy
- Vulnerability reporting process
- Security contacts
- Vulnerability history (if applicable)

## Documentation Validation

### Automated Checks

Consider implementing:

1. **Missing Files Check**
   - Verify required files exist (README.md, CONTRIBUTING.md, docs/DOCUMENTATION.md)

2. **ADR Validation**
   - Check for required metadata (Date, Status, Deciders, Last Reviewed, Tags)
   - Validate tags against approved list
   - Check tag count (1-5 tags)

3. **Link Validation**
   - Verify all links are valid
   - Check for broken cross-references

4. **Markdown Linting**
   - Use markdownlint or textlint
   - Enforce consistent formatting

### Manual Review Checklist

Before publishing documentation:

- [ ] All required sections are present
- [ ] ADR metadata is complete and valid
- [ ] Links are correct and point to existing files
- [ ] Code examples are tested and working
- [ ] Related packages section references current projects
- [ ] Last Updated dates are current

## Best Practices

### Writing Style

1. **Be Concise** - Focus on "how to run, build, test, release"
2. **Use Examples** - Show, don't just tell
3. **Keep Updated** - Documentation should reflect current code
4. **Cross-Reference** - Link related documents
5. **Use Consistent Formatting** - Follow markdown conventions

### Maintenance

1. **Review Periodically** - Schedule documentation reviews
2. **Update on Changes** - Update docs when code changes
3. **Version Documentation** - Keep docs in sync with code versions
4. **Archive Old Versions** - Preserve historical documentation

### Visual Aids

Consider using:

- **Mermaid Diagrams** - For architecture diagrams
- **PlantUML** - For sequence diagrams
- **Screenshots** - For UI projects
- **Code Blocks** - Always include examples

## AI Agent Integration

The Docs Drafter agent should:

1. **Validate Tags** - Check tags are from approved list when generating ADRs
2. **Verify Metadata** - Ensure all required ADR metadata is present
3. **Highlight Missing Items** - Warn about missing documentation
4. **Suggest Improvements** - Propose better structure or examples

## Getting Started

For new projects:

1. Copy `docs/DOCUMENTATION.template.md` to `docs/DOCUMENTATION.md`
2. Use templates from `kb-labs/docs/templates/` for README and CONTRIBUTING
3. Create initial ADRs using `docs/adr/0000-template.md`
4. Add Related Packages section to README
5. Follow this standard for all documentation

## Updates to This Standard

This standard is maintained in the `kb-labs` repository. To propose changes:

1. Create an ADR for significant changes
2. Update this document
3. Notify all projects to sync changes
4. Update templates as needed

## References

- [Keep a Changelog](https://keepachangelog.com/) - CHANGELOG format (managed by release-manager)
- [Conventional Commits](https://www.conventionalcommits.org/) - Commit message format
- [ADR GitHub](https://github.com/joelparkerhenderson/architecture-decision-record) - ADR format inspiration

---

**Last Updated:** 2025-01-28  
**Standard Version:** 1.0  
**Maintained By:** KB Labs Team

