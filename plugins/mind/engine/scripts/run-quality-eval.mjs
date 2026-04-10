#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REQUIRED_ROOT = '/Users/kirillbaranov/Desktop/kb-labs';
const DEFAULT_DATASET = path.join(
  REQUIRED_ROOT,
  'kb-labs-mind/packages/mind-engine/benchmarks/golden-set.v4.json',
);
const DEFAULT_RESULTS_CSV = '/tmp/mind-quality-eval.csv';
const DEFAULT_MODES = ['thinking'];

const argMap = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value || !value.startsWith('--')) {
    continue;
  }
  const [key, inline] = value.split('=');
  if (inline !== undefined) {
    argMap.set(key, inline);
    continue;
  }
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    argMap.set(key, next);
    index += 1;
  } else {
    argMap.set(key, 'true');
  }
}

const runs = Number(argMap.get('--runs') ?? process.env.RUNS ?? 1);
const datasetPath = path.resolve(argMap.get('--dataset') ?? DEFAULT_DATASET);
const resultsCsv = path.resolve(argMap.get('--results') ?? DEFAULT_RESULTS_CSV);
const modes = (argMap.get('--modes') ?? process.env.MODES ?? DEFAULT_MODES.join(','))
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

if (process.cwd() !== REQUIRED_ROOT) {
  console.error(`This script must run from ${REQUIRED_ROOT}`);
  console.error(`Current cwd: ${process.cwd()}`);
  process.exit(2);
}

if (!Number.isInteger(runs) || runs < 1) {
  console.error(`Invalid runs value: ${runs}`);
  process.exit(2);
}

if (modes.length === 0) {
  console.error('At least one mode is required');
  process.exit(2);
}

const datasetRaw = await fs.readFile(datasetPath, 'utf8');
const dataset = JSON.parse(datasetRaw);
if (!Array.isArray(dataset) || dataset.length === 0) {
  console.error(`Dataset is empty: ${datasetPath}`);
  process.exit(2);
}

const rows = [];
const startedAt = Date.now();

console.log('Mind Quality Eval v4');
console.log(`cwd=${process.cwd()}`);
console.log(`runs=${runs}`);
console.log(`dataset=${datasetPath}`);
console.log(`modes=${modes.join(',')}`);
console.log('');

for (let run = 1; run <= runs; run += 1) {
  for (const entry of dataset) {
    const caseModes = Array.isArray(entry.modes) && entry.modes.length > 0 ? entry.modes : modes;
    for (const mode of caseModes) {
      const query = String(entry.query ?? '');
      const expectedAnyOf = Array.isArray(entry.expectedAnyOf)
        ? entry.expectedAnyOf.map(item => String(item))
        : [];

      process.stdout.write(`[run ${run}] ${entry.id} (${mode}) ... `);
      const row = runCase({
        run,
        mode,
        query,
        caseId: String(entry.id ?? 'unknown'),
        group: String(entry.group ?? 'unknown'),
        expectedAnyOf,
      });
      rows.push(row);
      const marker = row.parseError ? 'PARSE_ERROR' : row.hit1 ? 'HIT1' : row.hit5 ? 'HIT5' : 'MISS';
      const sourceHint = row.topSource ? ` top=${row.topSource}` : '';
      console.log(`${marker} (${row.timingMs}ms)${sourceHint}`);
    }
  }
}

await saveCsv(resultsCsv, rows);
printSummary(rows, Date.now() - startedAt, resultsCsv);

function runCase({
  run,
  mode,
  query,
  caseId,
  group,
  expectedAnyOf,
}) {
  const command = spawnSync(
    'pnpm',
    ['-C', REQUIRED_ROOT, 'kb', 'mind', 'rag-query', '--agent', '--mode', mode, '--text', query],
    {
      cwd: REQUIRED_ROOT,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 20,
    },
  );

  const mergedOutput = `${command.stdout ?? ''}\n${command.stderr ?? ''}`;
  const jsonLine = extractLastJsonLine(mergedOutput);

  if (!jsonLine) {
    return {
      run,
      mode,
      caseId,
      group,
      query,
      expectedAnyOf,
      topSource: '',
      confidence: 0,
      complete: false,
      timingMs: -1,
      hit1: 0,
      hit5: 0,
      parseError: 1,
    };
  }

  let payload;
  try {
    payload = JSON.parse(jsonLine);
  } catch {
    return {
      run,
      mode,
      caseId,
      group,
      query,
      expectedAnyOf,
      topSource: '',
      confidence: 0,
      complete: false,
      timingMs: -1,
      hit1: 0,
      hit5: 0,
      parseError: 1,
    };
  }

  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const sourceFiles = sources
    .map(source => (source && typeof source.file === 'string' ? source.file : ''))
    .filter(Boolean);
  const topSource = sourceFiles[0] ?? '';

  const hit1 = expectedAnyOf.some(pattern => topSource.includes(pattern)) ? 1 : 0;
  const hit5 = sourceFiles.slice(0, 5).some(file =>
    expectedAnyOf.some(pattern => file.includes(pattern)),
  )
    ? 1
    : 0;

  return {
    run,
    mode,
    caseId,
    group,
    query,
    expectedAnyOf,
    topSource,
    confidence: toNumber(payload.confidence),
    complete: payload.complete === true,
    timingMs: toNumber(payload?.meta?.timingMs, -1),
    hit1,
    hit5,
    parseError: 0,
  };
}

function extractLastJsonLine(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.startsWith('{') && line.endsWith('}')) {
      return line;
    }
  }
  return '';
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function saveCsv(filePath, inputRows) {
  const header = [
    'run',
    'mode',
    'caseId',
    'group',
    'confidence',
    'complete',
    'timingMs',
    'hit1',
    'hit5',
    'parseError',
    'topSource',
    'query',
    'expectedAnyOf',
  ].join(',');

  const lines = inputRows.map(row =>
    [
      row.run,
      csvEscape(row.mode),
      csvEscape(row.caseId),
      csvEscape(row.group),
      row.confidence,
      row.complete ? 1 : 0,
      row.timingMs,
      row.hit1,
      row.hit5,
      row.parseError,
      csvEscape(row.topSource),
      csvEscape(row.query),
      csvEscape(row.expectedAnyOf.join('|')),
    ].join(','),
  );

  await fs.writeFile(filePath, `${header}\n${lines.join('\n')}\n`, 'utf8');
}

function csvEscape(value) {
  const raw = String(value ?? '');
  if (!/[",\n]/.test(raw)) {
    return raw;
  }
  return `"${raw.replaceAll('"', '""')}"`;
}

function printSummary(inputRows, durationMs, csvPath) {
  const validRows = inputRows.filter(row => row.parseError === 0);
  const parseErrors = inputRows.length - validRows.length;

  const overallHit1 = average(validRows.map(row => row.hit1));
  const overallHit5 = average(validRows.map(row => row.hit5));
  const overallConfidence = average(validRows.map(row => row.confidence));
  const overallTiming = average(validRows.map(row => row.timingMs).filter(value => value >= 0));

  const byMode = groupBy(validRows, row => row.mode);
  const byGroup = groupBy(validRows, row => row.group);
  const misses = validRows.filter(row => row.hit1 === 0);

  console.log('');
  console.log('Summary');
  console.log(`rows=${inputRows.length}, parseErrors=${parseErrors}`);
  console.log(`hit@1=${toPercent(overallHit1)} hit@5=${toPercent(overallHit5)}`);
  console.log(`avgConfidence=${overallConfidence.toFixed(4)} avgTimingMs=${Math.round(overallTiming)}`);
  console.log('');
  console.log('By mode');
  for (const [mode, rows] of byMode.entries()) {
    console.log(
      `  ${mode}: hit@1=${toPercent(average(rows.map(row => row.hit1)))} ` +
      `hit@5=${toPercent(average(rows.map(row => row.hit5)))} ` +
      `avgTimingMs=${Math.round(average(rows.map(row => row.timingMs).filter(value => value >= 0)))}`,
    );
  }
  console.log('');
  console.log('By group');
  for (const [group, rows] of byGroup.entries()) {
    console.log(
      `  ${group}: hit@1=${toPercent(average(rows.map(row => row.hit1)))} ` +
      `hit@5=${toPercent(average(rows.map(row => row.hit5)))} ` +
      `avgConfidence=${average(rows.map(row => row.confidence)).toFixed(4)}`,
    );
  }
  console.log('');
  if (misses.length > 0) {
    console.log('Misses');
    for (const miss of misses) {
      console.log(
        `  ${miss.caseId} [${miss.mode}] top=${miss.topSource || '<none>'} expected=${miss.expectedAnyOf.join('|')}`,
      );
    }
  } else {
    console.log('Misses');
    console.log('  none');
  }
  console.log('');
  console.log(`durationMs=${durationMs}`);
  console.log(`savedCsv=${csvPath}`);
}

function average(numbers) {
  if (!numbers.length) {
    return 0;
  }
  return numbers.reduce((sum, current) => sum + current, 0) / numbers.length;
}

function toPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function groupBy(list, keySelector) {
  const map = new Map();
  for (const item of list) {
    const key = keySelector(item);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}
