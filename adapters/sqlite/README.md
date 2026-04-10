# @kb-labs/adapters-sqlite

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

Lightweight embedded SQL database adapter using better-sqlite3 with FTS, JSON, and transaction support.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `ISQLDatabase` |
| **Type** | `core` |
| **Requires** | None |
| **Category** | Database |

## Features

- **Embedded Database** - No external server required
- **Full-Text Search** - FTS5 for fast text search
- **JSON Support** - Store and query JSON fields
- **Prepared Statements** - Optimized query execution
- **Transaction Support** - ACID-compliant operations

## Installation

```bash
pnpm add @kb-labs/adapters-sqlite
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "db": "@kb-labs/adapters-sqlite"
    },
    "adapterOptions": {
      "db": {
        "filename": ".kb/data/kb.db",
        "readonly": false,
        "timeout": 5000
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `filename` | `string` | - | Database file path (`:memory:` for in-memory) |
| `readonly` | `boolean` | `false` | Open in readonly mode |
| `timeout` | `number` | `5000` | Busy timeout in milliseconds |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Execute query
const users = platform.db.query<User>('SELECT * FROM users WHERE active = ?', [true]);

// Insert
platform.db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['John', 'john@example.com']);

// Transaction
platform.db.transaction(() => {
  platform.db.run('UPDATE accounts SET balance = balance - 100 WHERE id = ?', [1]);
  platform.db.run('UPDATE accounts SET balance = balance + 100 WHERE id = ?', [2]);
});
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-sqlite';

const db = createAdapter({ filename: ':memory:' });

db.run('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
db.run('INSERT INTO users (name) VALUES (?)', ['John']);

const users = db.query('SELECT * FROM users');
```

## Adapter Manifest

```typescript
{
  id: 'sqlite-database',
  name: 'SQLite Database',
  version: '1.0.0',
  implements: 'ISQLDatabase',
  capabilities: {
    transactions: true,
    search: true,
    custom: {
      prepared: true,
      fts: true,
      json: true,
    },
  },
}
```

## FAQ

<details>
<summary><strong>Q: How do I use in-memory database?</strong></summary>

Set filename to `:memory:`:

```json
{
  "adapterOptions": {
    "db": {
      "filename": ":memory:"
    }
  }
}
```
</details>

<details>
<summary><strong>Q: How do I enable WAL mode for better concurrency?</strong></summary>

Run pragma after initialization:

```typescript
db.run('PRAGMA journal_mode = WAL');
```
</details>

<details>
<summary><strong>Q: How do I use full-text search?</strong></summary>

Create FTS5 virtual table:

```typescript
db.run('CREATE VIRTUAL TABLE docs_fts USING fts5(content)');
db.run("INSERT INTO docs_fts VALUES ('hello world')");
const results = db.query("SELECT * FROM docs_fts WHERE docs_fts MATCH 'hello'");
```
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-log-sqlite` | Log persistence using SQLite |
| `@kb-labs/adapters-mongodb` | Document database for complex data |

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
