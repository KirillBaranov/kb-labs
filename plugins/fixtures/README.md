# fixtures

> Test fixture projects for KB Labs plugin integration tests.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)

---

## Overview

Fixtures provides sample projects used by KB Labs plugin tests — primarily
the Mind plugin's RAG indexing test suite. Each fixture is a self-contained
project with known structure, dependencies, and source files so tests can
assert deterministic indexing and query results.

---

## Contents

| Fixture | Package | Description |
|---------|---------|-------------|
| `small-project` | `sample-project` | Small TypeScript project for basic Mind indexing tests |
| `medium-project` | `@test/medium-project` | Medium complexity project for more extensive RAG tests |

---

## Usage

Fixtures are consumed by test suites — not installed directly.

```typescript
// In a test file:
import { getFixturePath } from '@kb-labs/fixtures';

const projectPath = getFixturePath('small-project');
```

---

## Changelog

### 0.1.0

- Initial fixtures: small-project, medium-project

---

## License

MIT
