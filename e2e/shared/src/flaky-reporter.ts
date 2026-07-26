import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchConventionalId, relativizeSpec } from './spec-id.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type FlakyErrorCategory = 'infra-timeout' | 'assertion-race' | 'ws-flake' | 'unknown'

interface FlakyAttempt {
  status: 'passed' | 'failed'
  retry: number
  durationMs: number
  errorCategory?: FlakyErrorCategory
  errorMessage?: string
}

interface FlakyCaseResult {
  suite: string
  spec: string
  testId: string
  title: string
  outcome: 'passed' | 'flaky' | 'failed' | 'skipped'
  attempts: FlakyAttempt[]
  evidence?: {
    runId: string
    path: string
    summaryPath?: string
    manifestPath?: string
  }
}

// v1 heuristic — refine as real error signatures show up in flaky-history.json.
const INFRA_TIMEOUT_PATTERN = /ECONNREFUSED|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|waiting for.*(healthy|ready)/i
const WS_FLAKE_PATTERN = /websocket|ws:\/\//i
const ASSERTION_RACE_PATTERN = /toBeVisible|toHaveText|toHaveValue|toHaveCount|waiting for selector|waiting for locator/i

function classify(message: string): FlakyErrorCategory {
  if (INFRA_TIMEOUT_PATTERN.test(message)) {return 'infra-timeout'}
  if (WS_FLAKE_PATTERN.test(message)) {return 'ws-flake'}
  if (ASSERTION_RACE_PATTERN.test(message)) {return 'assertion-race'}
  return 'unknown'
}

interface FlakyReporterOptions {
  suite?: string
}

export default class FlakyReporter implements Reporter {
  private cases: FlakyCaseResult[] = []
  private readonly suite: string

  constructor(options: FlakyReporterOptions = {}) {
    this.suite = options.suite ?? process.env.E2E_SUITE ?? 'unknown'
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const specFile = relativizeSpec(__dirname, test.location.file)

    const parsed = matchConventionalId(test.title)
    const testId = parsed?.id ?? test.titlePath().slice(1).join(' > ')
    const title = parsed?.rest ?? test.title

    let outcome: FlakyCaseResult['outcome']
    if (result.status === 'skipped') {
      outcome = 'skipped'
    } else if (result.status === 'passed') {
      outcome = result.retry > 0 ? 'flaky' : 'passed'
    } else {
      outcome = 'failed'
    }

    // test.results holds every attempt (including earlier failed retries), each with
    // its own error — onTestEnd itself only fires once, with the final attempt's result.
    const attempts: FlakyAttempt[] = test.results.map(r => {
      const message = r.errors[0]?.message ?? r.error?.message
      const failed = r.status !== 'passed' && r.status !== 'skipped'
      return {
        status: failed ? 'failed' : 'passed',
        retry: r.retry,
        durationMs: r.duration,
        ...(failed && message
          ? { errorCategory: classify(message), errorMessage: message.split('\n')[0]?.slice(0, 300) }
          : {}),
      }
    })

    const evidenceRoot = process.env.E2E_DIAGNOSTICS_PATH
    const evidenceRef = process.env.E2E_DIAGNOSTICS_REF ?? evidenceRoot
    const runId = process.env.E2E_DIAGNOSTICS_RUN_ID
    this.cases.push({
      suite: this.suite,
      spec: specFile,
      testId,
      title,
      outcome,
      attempts,
      ...(evidenceRoot && runId
        ? {
            evidence: {
              runId,
              path: evidenceRef,
              summaryPath: path.join(evidenceRef, 'summary.json'),
              manifestPath: path.join(evidenceRef, 'manifest.json'),
            },
          }
        : {}),
    })
  }

  onEnd(): void {
    const out = process.env.FLAKY_REPORT_OUT ?? path.join(__dirname, '../../../flaky-report.json')
    fs.writeFileSync(out, JSON.stringify(this.cases, null, 2))
    console.log(`\nFlaky report written → ${out} (${this.cases.length} case(s))`)
  }
}
