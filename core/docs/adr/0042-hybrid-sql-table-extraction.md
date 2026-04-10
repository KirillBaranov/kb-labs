# ADR-0042: Hybrid SQL Table Extraction for Database Permission Validation

**Date:** 2026-01-10
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-01-10
**Tags:** security, database, permissions, performance

## Context

Database permission validation requires extracting table names from SQL queries to verify they match the plugin's allowed namespace. This is part of the Storage & Database Adapters architecture (see `docs/STORAGE-AND-DATABASE-ADAPTERS-PLAN.md`).

### Problem

SQL table extraction can be done via:
1. **Regex-based parsing** — fast but unreliable for complex SQL
2. **Full SQL parser** — reliable but ~155x slower

### Benchmark Results

```
=== SQL Table Extraction Benchmark ===
Total operations: 60,000

PARSER (node-sql-parser):
  Per query: 0.038 ms (38 μs)
  Ops/sec: 26,341

REGEX:
  Per query: 0.0002 ms (0.2 μs)
  Ops/sec: 4,093,665

RATIO: Parser is 155x slower than Regex
```

### Threat Model

| Scenario | On-Prem | SaaS |
|----------|---------|------|
| Malicious plugin | User's own data, own risk | Physical tenant isolation |
| Developer error | Own data affected | Tenant isolation protects others |
| SQL bypass | Logged for audit | Separate DB per tenant |

Key insight: Security is enforced at infrastructure level (tenant isolation), not SQL parsing level. Permission validation serves as "guardrails" for honest developers, not security boundary.

## Decision

Implement **hybrid approach**: Regex-first with parser fallback for complex queries.

### Algorithm

```typescript
// @kb-labs/core-runtime/src/security/sql-table-extractor.ts

import { Parser } from 'node-sql-parser';

const parser = new Parser();

// Patterns that require full parsing
const COMPLEX_SQL_PATTERNS = [
  /\bWITH\b/i,           // CTE
  /\bUNION\b/i,          // UNION
  /\bINTERSECT\b/i,      // INTERSECT
  /\bEXCEPT\b/i,         // EXCEPT
  /\(\s*SELECT\b/i,      // Subquery
  /\bEXECUTE\b/i,        // Dynamic SQL (PostgreSQL)
  /\bPREPARE\b/i,        // Prepared statements
];

/**
 * Check if SQL query is complex and needs full parsing
 */
export function isComplexSQL(sql: string): boolean {
  return COMPLEX_SQL_PATTERNS.some(pattern => pattern.test(sql));
}

/**
 * Extract table names using regex (fast path)
 * Handles 99% of real-world queries
 */
export function extractTablesRegex(sql: string): string[] {
  const tables = new Set<string>();
  const patterns = [
    /\bFROM\s+["'`]?(\w+)["'`]?/gi,
    /\bJOIN\s+["'`]?(\w+)["'`]?/gi,
    /\bINTO\s+["'`]?(\w+)["'`]?/gi,
    /\bUPDATE\s+["'`]?(\w+)["'`]?/gi,
    /\bTABLE\s+["'`]?(\w+)["'`]?/gi,
    /\bTRUNCATE\s+(?:TABLE\s+)?["'`]?(\w+)["'`]?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      tables.add(match[1]!.toLowerCase());
    }
  }

  return Array.from(tables);
}

/**
 * Extract table names using full SQL parser (slow but accurate)
 */
export function extractTablesParser(sql: string, dialect: 'MySQL' | 'PostgreSQL' = 'MySQL'): string[] {
  try {
    const tableList = parser.tableList(sql, { database: dialect });
    // tableList returns: ['select::schema::table', 'insert::schema::table', ...]
    return tableList.map(entry => {
      const parts = entry.split('::');
      return parts[parts.length - 1]!.toLowerCase();
    });
  } catch (error) {
    // Parser failed - fall back to regex
    return extractTablesRegex(sql);
  }
}

/**
 * Extract tables with hybrid approach
 * - Fast regex for simple queries (~0.2μs)
 * - Full parser for complex queries (~38μs)
 */
export function extractTables(
  sql: string,
  dialect: 'MySQL' | 'PostgreSQL' = 'MySQL',
  logger?: { debug: (msg: string, meta?: any) => void }
): string[] {
  if (isComplexSQL(sql)) {
    logger?.debug('Complex SQL detected, using full parser', {
      sql: sql.substring(0, 100)
    });
    return extractTablesParser(sql, dialect);
  }

  return extractTablesRegex(sql);
}
```

### Integration with SecureSQLDatabase

```typescript
// @kb-labs/core-runtime/src/security/secure-sql.ts

import { extractTables, isComplexSQL } from './sql-table-extractor.js';

export class SecureSQLDatabase implements ISQLDatabase {
  private checkPermission(sql: string, operation: DatabaseOperation): void {
    const tables = extractTables(sql, this.getDialect(), this.logger);
    const namespace = this.permission.namespace.toLowerCase();

    for (const table of tables) {
      const isNamespaceMatch =
        table === namespace ||
        table.startsWith(`${namespace}_`);

      if (!isNamespaceMatch) {
        throw new PermissionError(
          `Plugin "${this.pluginId}" cannot access table "${table}". ` +
          `Allowed namespace: "${namespace}"`
        );
      }

      if (!this.permission.operations.includes(operation)) {
        throw new PermissionError(
          `Plugin "${this.pluginId}" cannot perform "${operation}" on "${table}"`
        );
      }
    }
  }
}
```

## Consequences

### Positive

- **Performance**: 99% queries use regex path (~0.2μs overhead)
- **Reliability**: Complex queries use full parser (~38μs, still <1% of typical query time)
- **Graceful degradation**: Parser errors fall back to regex
- **Auditability**: All queries logged, complex SQL flagged in debug logs
- **No external dependencies for simple cases**: Regex is built-in

### Negative

- **Dependency**: Adds `node-sql-parser` (~2MB) for complex query handling
- **Not 100% coverage**: Edge cases exist (implicit joins, comment tricks)
- **Dialect-specific**: Parser needs correct dialect setting

### Alternatives Considered

1. **Regex-only** — Rejected: misses subqueries, CTEs, bypassed easily
2. **Parser-only** — Rejected: 155x slower, overkill for simple queries
3. **Database-level GRANT** — Rejected: requires DB admin, complex setup
4. **View-based isolation** — Rejected: only for reads, requires migrations

## Implementation

### Phase 1 (MVP)
- [ ] Implement `extractTables()` with hybrid approach
- [ ] Integrate into `SecureSQLDatabase`
- [ ] Add debug logging for complex SQL detection
- [ ] Unit tests for edge cases

### Phase 2 (Post-MVP)
- [ ] Add dialect auto-detection from database adapter
- [ ] Metrics: track regex vs parser usage ratio
- [ ] Consider caching parsed results for repeated queries

### Package Dependencies

```json
{
  "dependencies": {
    "node-sql-parser": "^5.3.0"
  }
}
```

## References

- [Storage & Database Adapters Plan](../../docs/STORAGE-AND-DATABASE-ADAPTERS-PLAN.md)
- [ADR-0009: Cross-Plugin Invocation](./0009-cross-plugin-invocation.md) — permission model context
- [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) — SQL parser library

---

**Last Updated:** 2026-01-10
