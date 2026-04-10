# ADR-0004: Versioning and Release Policy

**Date:** 2025-09-13
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [process, deployment]

## Context

The KB Labs ecosystem must stay consistent, while still allowing individual products to evolve.

## Decision

- Use Semantic Versioning (SemVer) for all published packages
- Core (`@kb-labs/core`) follows stricter rules:
  - **MAJOR:** breaking changes in APIs/schemas
  - **MINOR:** new features, backward-compatible
  - **PATCH:** bugfixes
- Products (`ai-review`, `ai-docs`, `ai-tests`, etc.) can release independently, but must pin to compatible core versions
- Changelog generation automated via changesets or `@kb-labs/changelog-generator`
- Release flow:
  1. Pull request → CI check (lint, type-check, test)
  2. Merge → changeset entry created
  3. Release pipeline tags version, publishes to npm, updates changelog

## Consequences

**Positive:**

- Predictable updates across ecosystem
- Users know when breaking changes occur
- Easy adoption of multiple products without fear of hidden breakage

**Negative:**

- Requires careful coordination for major releases
- More complex release automation setup
