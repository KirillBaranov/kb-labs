# @kb-labs/rest-api

**Status:** MVP 1.0  
**Category:** Tools & Infrastructure  
**Repository:** [kb-labs-rest-api](https://github.com/KirillBaranov/kb-labs-rest-api)

## Overview

REST API layer for KB Labs CLI tools. Provides unified HTTP interface for audit, release, devlink, mind, and analytics commands.

## Key Features

- **Unified API** - Single REST interface for all CLI tools
- **Job Queue** - Asynchronous task execution with status tracking
- **Real-time Updates** - SSE (Server-Sent Events) for job progress
- **Error Handling** - Comprehensive error handling and reporting

## Documentation

- [README](https://github.com/KirillBaranov/kb-labs-rest-api/blob/main/README.md) - Full documentation and quick start guide
- [Contributing Guide](https://github.com/KirillBaranov/kb-labs-rest-api/blob/main/CONTRIBUTING.md) - Development guidelines
- [Architecture Decisions](https://github.com/KirillBaranov/kb-labs-rest-api/tree/main/docs/adr) - ADRs for this project

## Related Packages

- Depends on: @kb-labs/cli, @kb-labs/audit, @kb-labs/release-manager, @kb-labs/devlink, @kb-labs/mind, @kb-labs/analytics
- Used by: Web applications, external integrations


