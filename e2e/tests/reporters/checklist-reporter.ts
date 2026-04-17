import type { Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import fs from 'node:fs'
import path from 'node:path'

interface ChecklistEntry {
  id: string
  title: string
  spec: string
  outcome: 'passed' | 'failed' | 'skipped' | 'todo' | 'flaky'
}

const OUTCOME_ICON: Record<ChecklistEntry['outcome'], string> = {
  passed:  '✅ covered',
  failed:  '❌ FAILED',
  skipped: '⚠️ skipped',
  todo:    '📋 planned',
  flaky:   '⚠️ flaky',
}

export default class ChecklistReporter implements Reporter {
  private entries: ChecklistEntry[] = []

  onTestEnd(test: TestCase, result: TestResult): void {
    const specFile = path.relative(
      path.join(__dirname, '..'),
      test.location.file,
    )

    // Extract ID from test title: "S-01: ..." or "[S-01] ..."
    const idMatch = test.title.match(/^[\[#]?([A-Z]+-\d+)[:\]]\s*/)
    const id = idMatch?.[1] ?? '—'
    const title = idMatch ? test.title.slice(idMatch[0].length) : test.title

    let outcome: ChecklistEntry['outcome']
    if (test.expectedStatus === 'skipped') {
      outcome = 'todo'
    } else if (result.status === 'skipped') {
      outcome = 'skipped'
    } else if (result.status === 'passed') {
      outcome = result.retry > 0 ? 'flaky' : 'passed'
    } else {
      outcome = 'failed'
    }

    this.entries.push({ id, title, spec: specFile, outcome })
  }

  onEnd(): void {
    const grouped = new Map<string, ChecklistEntry[]>()

    for (const entry of this.entries) {
      const category = entry.spec.replace(/^specs\//, '').split('/')[0] ?? 'other'
      const group = grouped.get(category) ?? []
      group.push(entry)
      grouped.set(category, group)
    }

    const lines: string[] = [
      '# KB Labs E2E Checklist',
      '',
      '> Auto-generated — do not edit manually.',
      '> Source: `e2e/tests/specs/`. Run `pnpm test` to regenerate.',
      '',
      '```',
      `Last run: ${new Date().toISOString()}`,
      `Passed: ${this.entries.filter(e => e.outcome === 'passed').length}  ` +
      `Failed: ${this.entries.filter(e => e.outcome === 'failed').length}  ` +
      `Planned: ${this.entries.filter(e => e.outcome === 'todo').length}`,
      '```',
      '',
    ]

    for (const [category, entries] of grouped) {
      lines.push(`## ${capitalize(category)}`, '')
      lines.push('| ID | Scenario | Spec | Status |')
      lines.push('|----|----------|------|--------|')
      for (const e of entries) {
        lines.push(`| ${e.id} | ${e.title} | \`${e.spec}\` | ${OUTCOME_ICON[e.outcome]} |`)
      }
      lines.push('')
    }

    const out = process.env.CHECKLIST_OUT ?? path.join(__dirname, '../../CHECKLIST.md')
    fs.writeFileSync(out, lines.join('\n'))
    console.log(`\nChecklist written → ${out}`)
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
