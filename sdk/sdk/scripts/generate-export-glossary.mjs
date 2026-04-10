#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..');

const entrypoints = [
  { name: '@kb-labs/sdk', file: 'src/index.ts' },
  { name: '@kb-labs/sdk/command', file: 'src/command/index.ts' },
  { name: '@kb-labs/sdk/manifest', file: 'src/manifest/index.ts' },
  { name: '@kb-labs/sdk/hooks', file: 'src/hooks/index.ts' },
  { name: '@kb-labs/sdk/contracts', file: 'src/contracts/index.ts' },
  { name: '@kb-labs/sdk/types', file: 'src/types/index.ts' },
  { name: '@kb-labs/sdk/testing', file: 'src/testing/index.ts' },
];

function stripComments(input) {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function escapeMd(value) {
  return value.replace(/\|/g, '\\|');
}

function parseSymbols(specifierBlock, defaultKind) {
  return specifierBlock
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      let symbolRaw = s;
      let kind = defaultKind;
      if (symbolRaw.startsWith('type ')) {
        symbolRaw = symbolRaw.replace(/^type\s+/, '').trim();
        kind = 'type';
      }

      const aliasMatch = symbolRaw.match(/^(.+?)\s+as\s+(.+)$/);
      if (!aliasMatch) {
        return { exportedAs: symbolRaw, original: symbolRaw, kind };
      }
      return {
        original: aliasMatch[1].trim(),
        exportedAs: aliasMatch[2].trim(),
        kind,
      };
    });
}

function parseEntrypoint(sourceCode) {
  const found = [];

  const normalizeRow = (row) => {
    if (row.exportName.startsWith('type ')) {
      return {
        ...row,
        exportName: row.exportName.replace(/^type\s+/, '').trim(),
        kind: 'type',
      };
    }
    return row;
  };

  const reExportNamed = /export\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]\s*;/g;
  for (const match of sourceCode.matchAll(reExportNamed)) {
    const kind = match[1] ? 'type' : 'value';
    const from = match[3];
    const cleaned = stripComments(match[2]);
    const symbols = parseSymbols(cleaned, kind);
    for (const symbol of symbols) {
      found.push(normalizeRow({
        exportName: symbol.exportedAs,
        kind: symbol.kind,
        from,
      }));
    }
  }

  const reExportTypeStar = /export\s+type\s+\*\s+from\s+['"]([^'"]+)['"]\s*;/g;
  for (const match of sourceCode.matchAll(reExportTypeStar)) {
    found.push(normalizeRow({
      exportName: '*',
      kind: 'type',
      from: match[1],
    }));
  }

  const localExports =
    /export\s+(?:declare\s+)?(interface|type|function|const|class|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of sourceCode.matchAll(localExports)) {
    found.push(normalizeRow({
      exportName: match[2],
      kind: match[1] === 'function' || match[1] === 'const' || match[1] === 'class' || match[1] === 'enum' ? 'value' : 'type',
      from: '(local)',
    }));
  }

  const unique = new Map();
  for (const row of found) {
    const key = `${row.exportName}::${row.kind}::${row.from}`;
    unique.set(key, row);
  }

  return [...unique.values()].sort((a, b) =>
    a.exportName.localeCompare(b.exportName) ||
    a.kind.localeCompare(b.kind) ||
    a.from.localeCompare(b.from)
  );
}

async function main() {
  const sections = [];

  for (const entry of entrypoints) {
    const fullPath = path.join(pkgRoot, entry.file);
    const source = await readFile(fullPath, 'utf8');
    const rows = parseEntrypoint(source);
    sections.push({ ...entry, rows });
  }

  let md = '# SDK Exports Glossary\n\n';
  md += 'Auto-generated from SDK entrypoint surfaces. Do not edit manually.\n\n';
  md += 'Regenerate:\n\n';
  md += '```bash\n';
  md += 'pnpm --filter @kb-labs/sdk docs:exports\n';
  md += '```\n\n';

  for (const section of sections) {
    md += `## \`${section.name}\`\n\n`;
    md += `Source: \`${section.file}\`\n\n`;
    md += `Total exports: **${section.rows.length}**\n\n`;
    md += '| Export | Kind | From |\n';
    md += '|---|---|---|\n';
    for (const row of section.rows) {
      md += `| \`${escapeMd(row.exportName)}\` | \`${row.kind}\` | \`${escapeMd(row.from)}\` |\n`;
    }
    md += '\n';
  }

  const outPath = path.join(pkgRoot, 'EXPORTS-GLOSSARY.md');
  await writeFile(outPath, md, 'utf8');
  process.stdout.write(`Generated ${outPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
