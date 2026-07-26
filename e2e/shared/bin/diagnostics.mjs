import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { finished } from 'node:stream/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DEFAULT_SERVICES = ['gateway', 'rest-api', 'workflow', 'state-daemon', 'marketplace', 'marketplace-registry', 'mcp-daemon']

const METRIC_URLS = {
  gateway: process.env.GATEWAY_URL,
  'rest-api': process.env.REST_URL,
  workflow: process.env.WORKFLOW_URL,
  state: process.env.STATE_URL,
  marketplace: process.env.MARKETPLACE_URL,
  'marketplace-registry': process.env.REGISTRY_URL,
  mcp: process.env.MCP_URL,
}

const SECRET_PATTERNS = [
  /(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi,
  /((?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*)[^\s,;]+/gi,
  /(https?:\/\/[^\s/@]+):[^\s/@]+@/gi,
]

function redact(value) {
  let result = String(value ?? '')
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '$1[REDACTED]')
  return result
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'command'
}

async function writeText(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, redact(value), 'utf8')
}

function commandResult(code, signal, stdout, stderr) {
  return { code: code ?? 1, signal: signal ?? null, stdout, stderr }
}

function parsePrometheusSummary(body) {
  const metrics = {}
  for (const line of String(body).split('\n')) {
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+([-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)$/)
    if (!match) continue
    const [, name, raw] = match
    if (/process_(resident_memory_bytes|cpu_seconds_total)|http_requests_total|request_duration|active|queue|restart/i.test(name)) {
      const value = Number(raw)
      if (Number.isFinite(value)) metrics[name] = value
    }
  }
  return metrics
}

export function createDiagnosticCollector(options = {}) {
  const runId = options.runId ?? `e2e-${Date.now()}-${randomUUID().slice(0, 8)}`
  const rootDir = path.resolve(options.rootDir ?? path.join(process.cwd(), 'report', 'diagnostics', runId))
  const kbDev = options.kbDev ?? process.env.KB_DEV_BIN ?? 'kb-dev'
  const cwd = options.cwd ?? process.cwd()
  const suite = options.suite ?? process.env.E2E_SUITE ?? path.basename(cwd)
  const scenario = options.scenario
  const metricIntervalMs = options.metricIntervalMs ?? 10_000
  const metricSamples = []
  const collectionErrors = []
  let latestStatus
  let timer
  let startedAt
  let finalized = false

  async function init() {
    startedAt = new Date().toISOString()
    await mkdir(rootDir, { recursive: true })
    await writeText(path.join(rootDir, 'commands', 'collector.log'), `diagnostic collector started: ${startedAt}\n`)
    await snapshot('initial')
    timer = setInterval(() => { void snapshotMetrics('timeline') }, metricIntervalMs)
    timer.unref?.()
  }

  async function runCommand(command, args, label, commandCwd = cwd, extraEnv = {}) {
    const name = slug(label)
    const commandsDir = path.join(rootDir, 'commands')
    await mkdir(commandsDir, { recursive: true })
    const stdoutPath = path.join(commandsDir, `${name}.stdout.log`)
    const stderrPath = path.join(commandsDir, `${name}.stderr.log`)
    const stdout = createWriteStream(stdoutPath, { flags: 'w', mode: 0o600 })
    const stderr = createWriteStream(stderrPath, { flags: 'w', mode: 0o600 })
    let stdoutText = ''
    let stderrText = ''

    process.stdout.write(redact(`\n[e2e-runner] ${label}\n[e2e-runner] $ ${command} ${args.join(' ')}\n`))
    return await new Promise(resolve => {
      let settled = false
      const finish = async result => {
        if (settled) return
        settled = true
        stdout.end()
        stderr.end()
        await Promise.allSettled([finished(stdout), finished(stderr)])
        resolve({ ...result, stdoutPath, stderrPath })
      }
      let child
      try {
        child = spawn(command, args, { cwd: commandCwd, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        const message = `${error?.stack ?? error}\n`
        stderr.write(redact(message))
        process.stderr.write(`[e2e-runner] failed to spawn ${command}: ${error?.message ?? error}\n`)
        finish(commandResult(127, null, '', message))
        return
      }
      child.stdout?.on('data', chunk => {
        const text = chunk.toString()
        stdoutText += text
        stdout.write(redact(text))
        process.stdout.write(redact(text))
      })
      child.stderr?.on('data', chunk => {
        const text = chunk.toString()
        stderrText += text
        stderr.write(redact(text))
        process.stderr.write(redact(text))
      })
      child.on('error', error => { void finish(commandResult(127, null, stdoutText, `${stderrText}${error?.stack ?? error}\n`)) })
      child.on('close', (code, signal) => { void finish(commandResult(code, signal, stdoutText, stderrText)) })
    })
  }

  async function snapshot(kind) {
    await snapshotStatus(kind)
    await snapshotMetrics(kind)
    if (process.env.COMPOSE_FILE || process.env.E2E_DIAGNOSTICS_DOCKER === '1') await snapshotDocker(kind)
  }

  async function snapshotStatus(kind) {
    const result = await runRaw(kbDev, ['status', '--json'], `${kind}-kb-dev-status`)
    await writeText(path.join(rootDir, 'status', `kb-dev-status-${kind}.json`), result.stdout || result.stderr)
    if (result.code !== 0) collectionErrors.push({ source: `status:${kind}`, message: result.stderr || `exit ${result.code}` })

    const diagnose = await runRaw(kbDev, ['diagnose', '--json'], `${kind}-kb-dev-diagnose`)
    await writeText(path.join(rootDir, 'status', `kb-dev-diagnose-${kind}.json`), diagnose.stdout || diagnose.stderr)
    if (diagnose.code !== 0) collectionErrors.push({ source: `diagnose:${kind}`, message: diagnose.stderr || `exit ${diagnose.code}` })
    try {
      const diagnosticPayload = JSON.parse(diagnose.stdout)
      if (diagnosticPayload.config) {
        await writeText(path.join(rootDir, 'config', `effective-config-${kind}.json`), JSON.stringify(diagnosticPayload.config, null, 2))
      }
    } catch {
      // The complete diagnose output above remains available for partial or
      // legacy kb-dev implementations that do not emit the config section.
    }

    let status
    try { status = JSON.parse(result.stdout) } catch { status = null }
    if (status) latestStatus = status
    const services = Object.keys(status?.services ?? {})
    const serviceNames = services.length > 0 ? services : DEFAULT_SERVICES
    await Promise.all(serviceNames.map(async service => {
      const logs = await runRaw(kbDev, ['logs', service, '--all'], `${kind}-logs-${service}`)
      await writeText(path.join(rootDir, 'services', `${service}-${kind}.log`), logs.stdout || logs.stderr)
      if (logs.code !== 0 && logs.stderr) collectionErrors.push({ source: `logs:${service}:${kind}`, message: logs.stderr.slice(0, 500) })
    }))
    return status
  }

  async function runRaw(command, args, label) {
    return await new Promise(resolve => {
      let stdout = ''
      let stderr = ''
      let child
      try { child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }) } catch (error) {
        resolve(commandResult(127, null, '', `${error?.stack ?? error}`))
        return
      }
      child.stdout?.on('data', chunk => { stdout += chunk.toString() })
      child.stderr?.on('data', chunk => { stderr += chunk.toString() })
      child.on('error', error => resolve(commandResult(127, null, stdout, `${stderr}${error?.stack ?? error}`)))
      child.on('close', (code, signal) => resolve(commandResult(code, signal, stdout, stderr)))
    })
  }

  async function snapshotMetrics(kind) {
    const capturedAt = new Date().toISOString()
    const values = {}
    await mkdir(path.join(rootDir, 'metrics'), { recursive: true })
    await Promise.all(Object.entries(METRIC_URLS).map(async ([service, baseUrl]) => {
      if (!baseUrl) return
      const url = `${baseUrl.replace(/\/$/, '')}/metrics`
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const response = await fetch(url, { signal: controller.signal })
        clearTimeout(timeout)
        const body = await response.text()
        const redacted = redact(body)
        values[service] = {
          ok: response.ok,
          status: response.status,
          url,
          bytes: Buffer.byteLength(redacted),
          metrics: parsePrometheusSummary(redacted),
        }
        if (kind !== 'timeline') await writeText(path.join(rootDir, 'metrics', `${service}-${kind}.prom`), redacted)
        if (!response.ok) collectionErrors.push({ source: `metrics:${service}`, message: `HTTP ${response.status}` })
      } catch (error) {
        values[service] = { ok: false, url, error: error?.message ?? String(error) }
        collectionErrors.push({ source: `metrics:${service}`, message: error?.message ?? String(error) })
      }
    }))
    if (kind === 'timeline') {
      metricSamples.push({ timestamp: capturedAt, services: values })
      while (metricSamples.length > 180) metricSamples.shift()
      await writeText(path.join(rootDir, 'metrics', 'timeline.jsonl'), metricSamples.map(sample => JSON.stringify(sample)).join('\n') + '\n')
    }
    await writeText(path.join(rootDir, 'metrics', `${kind}.json`), JSON.stringify({ timestamp: capturedAt, services: values }, null, 2))
  }

  async function snapshotDocker(kind) {
    const ps = await runRaw('docker', ['compose', 'ps', '--all'], `${kind}-compose-ps`)
    await writeText(path.join(rootDir, 'status', `compose-ps-${kind}.txt`), ps.stdout || ps.stderr)
    if (ps.code !== 0) collectionErrors.push({ source: `docker:ps:${kind}`, message: ps.stderr || `exit ${ps.code}` })
    const inspect = await runRaw('docker', ['compose', 'ps', '-a', '-q'], `${kind}-compose-ids`)
    if (inspect.code === 0 && inspect.stdout.trim()) {
      const details = await runRaw('docker', ['inspect', ...inspect.stdout.trim().split(/\s+/)], `${kind}-compose-inspect`)
      await writeText(path.join(rootDir, 'status', `compose-inspect-${kind}.json`), details.stdout || details.stderr)
    }
    const stats = await runRaw('docker', ['stats', '--no-stream', '--all', '--format', '{{json .}}'], `${kind}-docker-stats`)
    await writeText(path.join(rootDir, 'status', `docker-stats-${kind}.jsonl`), stats.stdout || stats.stderr)
  }

  async function finalize(result = {}) {
    if (finalized) return
    finalized = true
    if (timer) clearInterval(timer)
    await snapshot(result.status === 'passed' ? 'final' : 'failure')
    const completedAt = new Date().toISOString()
    const failedServices = result.failedServices ?? Object.entries(latestStatus?.services ?? {})
      .filter(([, service]) => ['failed', 'dead', 'stopped'].includes(service.state))
      .map(([service]) => service)
    const summary = {
      schemaVersion: 1,
      runId,
      suite,
      ...(scenario ? { scenario } : {}),
      startedAt,
      completedAt,
      status: result.status ?? 'unknown',
      failurePhase: result.failurePhase,
      failureKind: result.failureKind,
      failedTests: result.failedTests ?? [],
      failedServices,
      collectionStatus: collectionErrors.length > 0 ? 'partial' : 'complete',
      collectionErrors: dedupeErrors(collectionErrors).slice(0, 50),
      evidencePath: rootDir,
      nextActions: buildNextActions(result),
    }
    await writeText(path.join(rootDir, 'summary.json'), JSON.stringify(summary, null, 2))
    await writeText(path.join(rootDir, 'manifest.json'), JSON.stringify({
      schemaVersion: 1, runId, suite, scenario, startedAt, completedAt,
      status: result.status ?? 'unknown', collectionStatus: summary.collectionStatus,
      collectionErrors: summary.collectionErrors,
      files: await listEvidence(rootDir),
    }, null, 2))
    return summary
  }

  return { runId, rootDir, init, runCommand, snapshot, finalize }
}

async function listEvidence(rootDir) {
  const entries = []
  async function walk(dir) {
    let names = []
    try { names = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of names) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(file)
      else entries.push({ path: path.relative(rootDir, file) })
    }
  }
  await walk(rootDir)
  return entries
}

function buildNextActions(result) {
  if (result.status === 'passed') return []
  const actions = ['Inspect summary.json and manifest.json']
  if (result.failedServices?.length) actions.push(`Inspect service logs for: ${result.failedServices.join(', ')}`)
  actions.push('Review status and metrics snapshots before reproducing locally')
  return actions
}

function dedupeErrors(errors) {
  const seen = new Set()
  return errors.filter(error => {
    const key = `${error.source}:${error.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export { redact }
