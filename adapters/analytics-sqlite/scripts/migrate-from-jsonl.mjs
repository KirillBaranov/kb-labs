#!/usr/bin/env node
/**
 * Migration script: Import JSONL analytics events into SQLite.
 *
 * Usage:
 *   node scripts/migrate-from-jsonl.mjs [--source <dir>] [--db <path>] [--dry-run]
 *
 * Defaults:
 *   --source  .kb/analytics/buffer
 *   --db      .kb/analytics/analytics.sqlite
 */

import Database from 'better-sqlite3';
import { existsSync, readdirSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    source: { type: 'string', default: '.kb/analytics/buffer' },
    db: { type: 'string', default: '.kb/analytics/analytics.sqlite' },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: false,
});

if (args.help) {
  console.log(`
migrate-from-jsonl.mjs — Import JSONL events into SQLite

Usage:
  node scripts/migrate-from-jsonl.mjs [options]

Options:
  --source <dir>    Source directory with .jsonl files (default: .kb/analytics/buffer)
  --db <path>       SQLite database file path (default: .kb/analytics/analytics.sqlite)
  --dry-run         Show what would be migrated without writing
  --help            Show this help
`);
  process.exit(0);
}

const sourceDir = resolve(process.cwd(), args.source);
const dbPath = resolve(process.cwd(), args.db);
const isDryRun = args['dry-run'];

if (!existsSync(sourceDir)) {
  console.error(`❌ Source directory not found: ${sourceDir}`);
  process.exit(1);
}

const jsonlFiles = readdirSync(sourceDir)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => join(sourceDir, f));

if (jsonlFiles.length === 0) {
  console.log(`⚠️  No .jsonl files found in: ${sourceDir}`);
  process.exit(0);
}

console.log(`\n📂 Source: ${sourceDir}`);
console.log(`📦 Database: ${dbPath}`);
console.log(`📄 JSONL files found: ${jsonlFiles.length}`);
if (isDryRun) console.log(`🔍 DRY RUN — no data will be written\n`);

if (!isDryRun) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

// Count total lines across all files
let totalLines = 0;
for (const f of jsonlFiles) {
  const content = readFileSync(f, 'utf8');
  totalLines += content.split('\n').filter(l => l.trim()).length;
}
console.log(`📊 Events in JSONL source: ${totalLines}`);

if (isDryRun) {
  console.log(`\nWould insert up to ${totalLines} events into ${dbPath}`);
  process.exit(0);
}

// Open SQLite
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  schema      TEXT NOT NULL DEFAULT 'kb.v1',
  type        TEXT NOT NULL,
  ts          TEXT NOT NULL,
  ingest_ts   TEXT,
  run_id      TEXT,
  product     TEXT,
  version     TEXT,
  actor_type  TEXT,
  actor_id    TEXT,
  actor_name  TEXT,
  ctx         TEXT,
  payload     TEXT
)
`);

db.exec(`CREATE INDEX IF NOT EXISTS events_ts_idx ON events (ts)`);
db.exec(`CREATE INDEX IF NOT EXISTS events_type_idx ON events (type)`);
db.exec(`CREATE INDEX IF NOT EXISTS events_product_idx ON events (product)`);
db.exec(`CREATE INDEX IF NOT EXISTS events_type_ts_idx ON events (type, ts)`);

const countBefore = db.prepare('SELECT COUNT(*) as cnt FROM events').get().cnt;
console.log(`📊 Events in DB before migration: ${countBefore}`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO events
    (id, schema, type, ts, ingest_ts, run_id, product, version, actor_type, actor_id, actor_name, ctx, payload)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

console.log('\n⏳ Migrating...');
const startMs = Date.now();

let parsed = 0;
let skipped = 0;

const migrate = db.transaction(() => {
  for (const file of jsonlFiles) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        skipped++;
        continue;
      }

      if (!event.id || !event.type || !event.ts) {
        skipped++;
        continue;
      }

      insert.run(
        String(event.id),
        event.schema ?? 'kb.v1',
        String(event.type),
        String(event.ts),
        event.ingestTs ?? event.ts ?? null,
        event.runId ?? null,
        event.source?.product ?? null,
        event.source?.version ?? null,
        event.actor?.type ?? null,
        event.actor?.id ?? null,
        event.actor?.name ?? null,
        event.ctx ? JSON.stringify(event.ctx) : null,
        event.payload ? JSON.stringify(event.payload) : null,
      );
      parsed++;
    }
  }
});

migrate();

const elapsedMs = Date.now() - startMs;
const countAfter = db.prepare('SELECT COUNT(*) as cnt FROM events').get().cnt;
const inserted = countAfter - countBefore;
const duplicates = parsed - inserted;

console.log(`\n✅ Migration complete in ${(elapsedMs / 1000).toFixed(1)}s`);
console.log(`   Parsed:    ${parsed} events`);
console.log(`   Inserted:  ${inserted} events`);
console.log(`   Skipped:   ${duplicates} (duplicates) + ${skipped} (parse errors)`);
console.log(`   Total now: ${countAfter} events in DB`);

const range = db.prepare('SELECT MIN(ts) as oldest, MAX(ts) as newest FROM events').get();
if (range?.oldest) {
  console.log(`   Time range: ${range.oldest} → ${range.newest}`);
}

console.log('\n📈 Top event types:');
const topTypes = db.prepare(`
  SELECT type, COUNT(*) as cnt FROM events GROUP BY type ORDER BY cnt DESC LIMIT 10
`).all();
for (const row of topTypes) {
  console.log(`   ${String(row.cnt).padStart(6)}  ${row.type}`);
}

db.close();
