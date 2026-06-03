#!/usr/bin/env node
/**
 * generate-ports-doc — writes docs/ports.md from the port registry + devservices.
 *
 * Run:  pnpm ports:generate   (or: node scripts/generate-ports-doc.mjs)
 *
 * The output is committed to the repo. check-ports.mjs enforces that the
 * committed file matches what this script would produce (STALE_PORTS_DOC),
 * so the glossary can never drift from the registry.
 */

import { writeFileSync } from 'node:fs';
import { loadRegistry, loadDevservices, renderDoc, PATHS } from './lib/ports.mjs';

function main() {
  const registry = loadRegistry();
  const services = loadDevservices();
  const content = renderDoc(registry, services);
  writeFileSync(PATHS.doc, content + '\n', 'utf8');
  process.stdout.write(`Wrote ${PATHS.doc} (${services.length} services, ${Object.keys(registry.ranges).length} ranges)\n`);
}

main();
