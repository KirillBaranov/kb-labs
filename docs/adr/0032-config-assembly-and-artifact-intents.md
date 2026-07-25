# ADR-0032: Config Assembly and Artifact Intents Are Declarative

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** architecture, configuration, installer

## Context

`kb.config.jsonc` was sometimes missing, malformed, or assembled differently
depending on the scenario. Components also need arbitrary artifact paths and
project/platform outputs.

## Decision

Plans carry scoped config patches and output contracts. Assembly applies
defaults, selected component/provider patches, scenario values, and explicit
platform/project roots in a deterministic order, writes atomically, and reads
back the result before reporting success. Artifact paths are represented as
typed install intents and are handled by the common executor.

## Consequences

Config generation is testable independently from presentation and package
installation. Invalid paths, conflicting patches, and malformed output fail
with structured errors before the install is reported successful.
