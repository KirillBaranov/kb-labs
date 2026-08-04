#!/usr/bin/env node
/**
 * Resolve E2E ownership from the complete PR diff.
 *
 * Zone manifests live next to their suites: e2e/<zone>/ci.zone.json. We use
 * `git diff --name-status -M <base>...HEAD`, deliberately not HEAD~1, so a
 * multi-commit PR and file moves are evaluated as one reviewable test plan.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKER = '<!-- kb-ci-test-plan -->';

function args() {
  const value = (name, fallback = '') => {
    const index = process.argv.indexOf(name);
    return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
  };
  return {
    baseRef: value('--base-ref', process.env.KB_DEVKIT_BASE_REF || 'HEAD'),
    output: value('--output'),
    markdown: value('--markdown'),
  };
}

export function parseNameStatus(text) {
  return text.trim().split('\n').filter(Boolean).map((line) => {
    const fields = line.split('\t');
    const status = fields[0];
    if (/^[RC]/.test(status)) {
      return { status, oldPath: fields[1], newPath: fields[2], paths: [fields[1], fields[2]] };
    }
    return { status, path: fields[1], paths: [fields[1]] };
  });
}

function segmentMatches(value, pattern) {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`).test(value);
}

// Minimal glob matcher for the intentionally small manifest syntax: *, ** and
// literal path components. Unlike a regex-only conversion, ** matches zero
// directories too (core/** matches a file directly under core/).
export function matchesGlob(file, glob) {
  const files = file.split('/');
  const globs = glob.replace(/^\.\//, '').split('/');
  const visit = (fileIndex, globIndex) => {
    if (globIndex === globs.length) return fileIndex === files.length;
    if (globs[globIndex] === '**') {
      return visit(fileIndex, globIndex + 1) ||
        (fileIndex < files.length && visit(fileIndex + 1, globIndex));
    }
    return fileIndex < files.length && segmentMatches(files[fileIndex], globs[globIndex]) && visit(fileIndex + 1, globIndex + 1);
  };
  return visit(0, 0);
}

function manifests() {
  const e2e = path.join(ROOT, 'e2e');
  return fs.readdirSync(e2e, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(e2e, entry.name, 'ci.zone.json'))
    .filter(fs.existsSync)
    .map((file) => ({ file: path.relative(ROOT, file), ...JSON.parse(fs.readFileSync(file, 'utf8')) }));
}

function matchingZones(file, zones) {
  return zones.filter((zone) => (zone.watch ?? []).some((glob) => matchesGlob(file, glob)));
}

function ignored(file, globalZone) {
  return (globalZone?.ignore ?? []).some((glob) => matchesGlob(file, glob));
}

export function buildPlan(changes, zones) {
  const globalZone = zones.find((zone) => zone.mode === 'global');
  const testZones = zones.filter((zone) => zone.mode !== 'global');
  const selected = new Map();
  const warnings = [];

  const add = (zone, file, reason) => {
    if (!selected.has(zone.zone)) selected.set(zone.zone, {
      zone: zone.zone,
      runner: zone.runner ?? 'docker',
      suites: zone.suites ?? [],
      files: [],
      reasons: new Set(),
    });
    const item = selected.get(zone.zone);
    item.files.push(file);
    item.reasons.add(reason);
  };

  for (const change of changes) {
    const direct = new Map();
    for (const file of change.paths) {
      for (const zone of matchingZones(file, testZones)) direct.set(zone.zone, zone);
    }
    const globalMatch = change.paths.some((file) => matchingZones(file, [globalZone]).length > 0);
    if (globalMatch) {
      for (const zone of testZones) add(zone, change.paths.join(' → '), 'global dependency or E2E infrastructure');
    } else {
      for (const zone of direct.values()) add(zone, change.paths.join(' → '), change.status.startsWith('R') ? 'rename endpoint' : 'path match');
    }

    for (const file of change.paths) {
      const covered = globalMatch || matchingZones(file, testZones).length > 0 || ignored(file, globalZone);
      if (!covered) warnings.push({ type: 'uncovered', file });
    }
    if (change.oldPath && change.newPath) {
      const oldZones = matchingZones(change.oldPath, testZones);
      const newZones = matchingZones(change.newPath, testZones);
      if (oldZones.length > 0 && newZones.length === 0 && !globalMatch) {
        warnings.push({ type: 'rename-uncovered', oldPath: change.oldPath, newPath: change.newPath });
      }
    }
  }

  return {
    changes,
    selected: [...selected.values()].map((item) => ({ ...item, files: [...new Set(item.files)], reasons: [...item.reasons] })),
    warnings: [...new Map(warnings.map((warning) => [JSON.stringify(warning), warning])).values()],
  };
}

export function markdown(plan, baseRef) {
  const lines = [MARKER, '## CI test plan', '', `Diff: \`${baseRef}\` (all files in the PR, rename-aware).`, ''];
  if (plan.selected.length === 0) lines.push('No E2E zone selected.');
  else {
    lines.push('### Selected E2E zones', '');
    for (const zone of plan.selected) {
      lines.push(`- **${zone.zone}** [${zone.runner}] → ${zone.suites.map((suite) => `\`${suite}\``).join(', ')} _(${zone.reasons.join('; ')})_`);
    }
  }
  if (plan.warnings.length > 0) {
    lines.push('', '### Coverage warnings', '');
    for (const warning of plan.warnings) {
      if (warning.type === 'rename-uncovered') lines.push(`- ⚠️ Rename leaves E2E ownership: \`${warning.oldPath}\` → \`${warning.newPath}\`.`);
      else lines.push(`- ⚠️ No E2E zone owns \`${warning.file}\`.`);
    }
  }
  lines.push('', `<sub>${plan.changes.length} diff entries evaluated. Update an \`e2e/*/ci.zone.json\` manifest when ownership changes.</sub>`);
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = args();
  const diff = execFileSync('git', ['diff', '--name-status', '--find-renames=50%', options.baseRef], { cwd: ROOT, encoding: 'utf8' });
  const plan = buildPlan(parseNameStatus(diff), manifests());
  const rendered = markdown(plan, options.baseRef);
  if (options.output) fs.writeFileSync(path.resolve(ROOT, options.output), `${JSON.stringify(plan, null, 2)}\n`);
  if (options.markdown) fs.writeFileSync(path.resolve(ROOT, options.markdown), `${rendered}\n`);
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
