# @kb-labs/adapters-mongodb

> Part of [KB Labs](https://github.com/KirillBaranov/kb-labs) ecosystem. Works exclusively within KB Labs platform.

MongoDB document database adapter with full aggregation pipeline and index support.

## Overview

| Property | Value |
|----------|-------|
| **Implements** | `IDocumentDatabase` |
| **Type** | `core` |
| **Requires** | None |
| **Category** | Database |

## Features

- **Document Storage** - Flexible JSON-like document storage
- **Aggregation Pipeline** - Complex data transformations
- **Full-Text Search** - Text indexes for search
- **Transactions** - Multi-document ACID transactions
- **Connection Pooling** - Efficient connection management

## Installation

```bash
pnpm add @kb-labs/adapters-mongodb
```

## Configuration

Add to your `kb.config.json`:

```json
{
  "platform": {
    "adapters": {
      "documentDb": "@kb-labs/adapters-mongodb"
    },
    "adapterOptions": {
      "documentDb": {
        "uri": "mongodb://localhost:27017",
        "database": "kb-labs",
        "poolSize": 10
      }
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `uri` | `string` | - | MongoDB connection URI |
| `database` | `string` | - | Database name |
| `poolSize` | `number` | `10` | Connection pool size |

## Usage

### Via Platform (Recommended)

```typescript
import { usePlatform } from '@kb-labs/sdk';

const platform = usePlatform();

// Insert document
await platform.documentDb.insert('users', {
  name: 'John',
  email: 'john@example.com'
});

// Find documents
const users = await platform.documentDb.find('users', {
  name: { $regex: 'John' }
});

// Aggregate
const stats = await platform.documentDb.aggregate('orders', [
  { $group: { _id: '$status', count: { $sum: 1 } } }
]);
```

### Standalone (Testing/Development)

```typescript
import { createAdapter } from '@kb-labs/adapters-mongodb';

const db = createAdapter({
  uri: 'mongodb://localhost:27017',
  database: 'test'
});

await db.connect();
await db.insert('collection', { key: 'value' });
```

## Adapter Manifest

```typescript
{
  id: 'mongodb-documentdb',
  name: 'MongoDB Document Database',
  version: '1.0.0',
  implements: 'IDocumentDatabase',
  capabilities: {
    transactions: true,
    search: true,
    custom: {
      aggregation: true,
      indexes: true,
      fullText: true,
    },
  },
}
```

## FAQ

<details>
<summary><strong>Q: How do I connect to MongoDB Atlas?</strong></summary>

Use the Atlas connection string:

```json
{
  "adapterOptions": {
    "documentDb": {
      "uri": "mongodb+srv://user:pass@cluster.mongodb.net",
      "database": "mydb"
    }
  }
}
```
</details>

## Related Adapters

| Adapter | Use Case |
|---------|----------|
| `@kb-labs/adapters-sqlite` | Embedded SQL database |
| `@kb-labs/adapters-qdrant` | Vector database for semantic search |

## License

[KB Public License v1.1](../../LICENSE) - KB Labs Team
