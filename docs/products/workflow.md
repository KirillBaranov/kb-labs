# @kb-labs/workflow

**Status:** MVP 1.0
**Category:** Orchestration
**Repository:** [kb-labs-workflow](https://github.com/KirillBaranov/kb-labs-workflow)

## Overview

Workflow orchestration engine for KB Labs ecosystem. Provides workflow execution, job scheduling, and step orchestration capabilities with distributed coordination through Redis.

## Key Features

- **Declarative Workflows** - Define workflows using declarative YAML/JSON format
- **Job Scheduling** - Schedule jobs with cron expressions and dependencies
- **Step Orchestration** - Multi-step execution with error handling and retries
- **Distributed Coordination** - Redis-based coordination for multi-instance deployments
- **Multi-Tenancy** - Built-in multi-tenancy support with quotas and rate limiting
- **Observability** - Comprehensive logging, metrics, and tracing

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-workflow/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-workflow/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-workflow/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/core, @kb-labs/plugin
- Used by: All plugins, AI products, automation workflows
