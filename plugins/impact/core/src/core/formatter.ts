import type { ImpactAnalysisResult } from '@kb-labs/impact-contracts';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

export function formatHumanReadable(result: ImpactAnalysisResult): string {
  const lines: string[] = [];

  lines.push(`${BOLD}📊 Impact Analysis${RESET}`);
  lines.push('');

  // ── Package Impact ──
  const { direct, dependent, transitive } = result.packages;
  const totalPkgs = direct.length + dependent.length + transitive.length;

  if (totalPkgs > 0) {
    lines.push(`${BOLD}📦 Package Impact${RESET}`);

    if (direct.length > 0) {
      lines.push(`  ${GREEN}Direct (${direct.length}):${RESET}`);
      for (const p of direct) {
        lines.push(`    ${p.name} ${DIM}(${p.repo})${RESET} — ${p.changedFiles} file${p.changedFiles === 1 ? '' : 's'} changed`);
      }
    }

    if (dependent.length > 0) {
      lines.push(`  ${YELLOW}Dependent (${dependent.length}):${RESET}`);
      for (const p of dependent) {
        lines.push(`    ${p.name} ${DIM}← ${p.reason}${RESET}`);
      }
    }

    if (transitive.length > 0) {
      lines.push(`  ${DIM}Transitive (${transitive.length}):${RESET}`);
      for (const p of transitive) {
        lines.push(`    ${p.name} ${DIM}← ${p.reason}${RESET}`);
      }
    }

    lines.push('');
  }

  // ── Build Impact ──
  const { steps: buildSteps, command: buildCommand, totalPackages: buildTotal } = result.build;

  if (buildTotal > 0) {
    lines.push(`${BOLD}🔨 Build Impact${RESET}`);
    lines.push(`  ${YELLOW}Rebuild (${buildTotal} packages in order):${RESET}`);
    for (const b of buildSteps) {
      const reason = b.level === 'direct' ? 'changed' : b.reason ?? '';
      lines.push(`    ${DIM}${b.order}.${RESET} ${b.name} ${DIM}← ${reason}${RESET}`);
    }
    if (buildCommand) {
      lines.push('');
      lines.push(`  ${CYAN}→ ${buildCommand}${RESET}`);
    }
    lines.push('');
  }

  // ── Doc Impact ──
  const { stale, review, reindex } = result.docs;
  const totalDocs = stale.length + review.length + reindex.length;

  if (totalDocs > 0) {
    lines.push(`${BOLD}📄 Doc Impact${RESET}`);

    if (stale.length > 0) {
      lines.push(`  ${YELLOW}Stale (${stale.length}):${RESET}`);
      for (const d of stale) {
        lines.push(`    ${d.file} — ${d.reason}`);
        if (d.command) {lines.push(`    ${CYAN}→ Run: ${d.command}${RESET}`);}
      }
    }

    if (review.length > 0) {
      lines.push(`  ${GREEN}Review (${review.length}):${RESET}`);
      for (const d of review) {
        lines.push(`    ${d.file} — ${d.reason}`);
      }
    }

    if (reindex.length > 0) {
      lines.push(`  ${CYAN}Reindex (${reindex.length}):${RESET}`);
      for (const d of reindex) {
        lines.push(`    ${d.reason}`);
        if (d.command) {lines.push(`    ${CYAN}→ Run: ${d.command}${RESET}`);}
      }
    }

    lines.push('');
  }

  // ── Test Impact ──
  const { mustRun, noTests } = result.tests;
  const totalTests = mustRun.length + noTests.length;

  if (totalTests > 0) {
    lines.push(`${BOLD}🧪 Test Impact${RESET}`);

    if (mustRun.length > 0) {
      lines.push(`  ${GREEN}Must run (${mustRun.length}):${RESET}`);
      for (const t of mustRun) {
        const count = t.testCount ? ` — ${t.testCount} test file${t.testCount === 1 ? '' : 's'}` : '';
        const reason = t.level === 'direct' ? 'changed' : t.reason ?? '';
        lines.push(`    ${t.name}${count} ${DIM}← ${reason}${RESET}`);
        if (t.command) {lines.push(`    ${CYAN}→ ${t.command}${RESET}`);}
      }
    }

    if (noTests.length > 0) {
      lines.push(`  ${RED}⚠️  No tests (${noTests.length}):${RESET}`);
      for (const t of noTests) {
        const reason = t.level === 'direct' ? 'changed, NO TESTS' : `${t.reason}, NO TESTS`;
        lines.push(`    ${RED}${t.name}${RESET} ${DIM}← ${reason}${RESET}`);
      }
    }

    lines.push('');
  }

  // ── Recommendations ──
  if (result.recommendations.length > 0) {
    lines.push(`${BOLD}⚠️  Recommendations:${RESET}`);
    for (const rec of result.recommendations) {
      lines.push(`  • ${rec}`);
    }
    lines.push('');
  }

  if (totalPkgs === 0 && totalDocs === 0 && totalTests === 0) {
    lines.push(`${GREEN}✅ No impact detected.${RESET}`);
  }

  return lines.join('\n');
}
