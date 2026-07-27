import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { spawn } from 'node:child_process'
import { finished } from 'node:stream/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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
  let latestDiagnose
  let timer
  let startedAt
  let finalized = false
  let gatewayTokenPromise

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
      latestDiagnose = diagnosticPayload
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
    const serviceNames = configuredServiceNames(status, latestDiagnose)
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
    await Promise.all(Object.entries(metricTargets(latestStatus, latestDiagnose)).map(async ([service, target]) => {
      const baseUrl = target.url
      const url = baseUrl.endsWith('/metrics') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/metrics`
      try {
        const headers = {}
        if (target.gateway) {
          const token = await getGatewayToken(target.gateway, () => {
            gatewayTokenPromise ??= issueGatewayToken(target.gateway)
            return gatewayTokenPromise
          })
          if (token) headers.Authorization = `Bearer ${token}`
        }
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)
        const response = await fetch(url, { signal: controller.signal, headers })
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
        if (!response.ok && response.status !== 404) collectionErrors.push({ source: `metrics:${service}`, message: `HTTP ${response.status}` })
      } catch (error) {
        values[service] = { ok: false, url, error: error?.message ?? String(error) }
        collectionErrors.push({ source: `metrics:${service}`, message: error?.message ?? String(error) })
      }
    }))
    if (kind === 'timeline' || kind === 'initial' || kind === 'final' || kind === 'failure') {
      metricSamples.push({ timestamp: capturedAt, phase: kind, services: values })
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

function configuredServiceNames(status, diagnose) {
  return [...new Set([
    ...Object.keys(status?.services ?? {}),
    ...Object.keys(diagnose?.config?.resolved?.services ?? {}),
  ])].sort()
}

function metricTargets(status, diagnose) {
  const targets = {}
  const gatewayUrl = process.env.GATEWAY_URL ?? status?.services?.gateway?.url
  if (typeof gatewayUrl === 'string' && /^https?:\/\//i.test(gatewayUrl)) {
    targets.gateway = { url: gatewayUrl, gateway: gatewayUrl }
  }

  for (const [service, snapshot] of Object.entries(status?.services ?? {})) {
    if (service === 'gateway' || service === 'studio') continue
    if (typeof snapshot.url === 'string' && /^https?:\/\//i.test(snapshot.url)) targets[service] = { url: snapshot.url }
  }
  for (const [service, snapshot] of Object.entries(diagnose?.config?.resolved?.services ?? {})) {
    if (targets[service]) continue
    if (service === 'studio') continue
    if (typeof snapshot.url === 'string' && /^https?:\/\//i.test(snapshot.url)) targets[service] = { url: snapshot.url }
  }
  for (const entry of String(process.env.E2E_DIAGNOSTICS_METRIC_URLS ?? '').split(',')) {
    const separator = entry.indexOf('=')
    if (separator > 0) {
      targets[entry.slice(0, separator).trim()] = { url: entry.slice(separator + 1).trim() }
    }
  }
  return Object.fromEntries(Object.entries(targets).filter(([, url]) => url))
}

async function getGatewayToken(gatewayUrl, issueToken) {
  try {
    const probe = await fetch(`${gatewayUrl.replace(/\/$/, '')}/metrics`)
    if (probe.status !== 401) return null
    return await issueToken()
  } catch {
    return await issueToken()
  }
}

async function issueGatewayToken(gatewayUrl) {
  const baseUrl = gatewayUrl.replace(/\/$/, '')
  const email = process.env.GATEWAY_BOOTSTRAP_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? 'admin@e2e.test'
  const password = process.env.GATEWAY_BOOTSTRAP_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? 'E2eBootstrapPass1!'
  const tenantId = process.env.GATEWAY_BOOTSTRAP_TENANT_ID ?? process.env.TENANT_ID ?? 'kblabs-cloud'

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, tenantId }),
  })
  if (!login.ok) throw new Error(`gateway auth login failed: HTTP ${login.status}`)

  const cookie = getSetCookie(login)
  const register = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ name: `e2e-diagnostics-${process.pid}`, namespaceId: 'e2e', capabilities: [] }),
  })
  if (!register.ok) throw new Error(`gateway auth register failed: HTTP ${register.status}`)
  const credentials = await register.json()

  const token = await fetch(`${baseUrl}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: credentials.clientId, clientSecret: credentials.clientSecret }),
  })
  if (!token.ok) throw new Error(`gateway auth token failed: HTTP ${token.status}`)
  return (await token.json()).accessToken
}

function getSetCookie(response) {
  const cookies = response.headers.getSetCookie?.() ?? []
  if (cookies.length > 0) return cookies.map(cookie => cookie.split(';', 1)[0]).join('; ')
  const cookie = response.headers.get('set-cookie')
  return cookie ? cookie.split(';', 1)[0] : ''
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
