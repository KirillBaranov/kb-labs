import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { loadPlatformConfig } from '../config-loader.js'

function makePlatformDir(dir: string, configContents?: unknown): void {
  mkdirSync(path.join(dir, 'node_modules', '@kb-labs', 'cli-bin'), { recursive: true })
  if (configContents !== undefined) {
    mkdirSync(path.join(dir, '.kb'), { recursive: true })
    writeFileSync(path.join(dir, '.kb', 'kb.config.json'), JSON.stringify(configContents))
  }
}

function makeProjectDir(dir: string, configContents?: unknown): void {
  mkdirSync(dir, { recursive: true })
  if (configContents !== undefined) {
    mkdirSync(path.join(dir, '.kb'), { recursive: true })
    writeFileSync(path.join(dir, '.kb', 'kb.config.json'), JSON.stringify(configContents))
  }
}

function writeOverlay(projectRoot: string, name: string, contents: string): string {
  const dir = path.join(projectRoot, '.kb', 'overlays')
  mkdirSync(dir, { recursive: true })
  const full = path.join(dir, name)
  writeFileSync(full, contents)
  return full
}

describe('loadPlatformConfig: overlays', () => {
  let tmpDir: string
  let originalCwd: string

  beforeAll(() => {
    originalCwd = process.cwd()
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kb-cfg-overlays-'))
  })

  afterEach(() => {
    process.chdir(tmpDir)
  })

  afterAll(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns sources.overlays undefined when no overlays directory exists', async () => {
    const platformRoot = path.join(tmpDir, 'o1-platform')
    const projectRoot = path.join(tmpDir, 'o1-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: { adapters: { llm: 'openai' } } })

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters).toEqual({ llm: 'openai' })
    expect(result.sources.overlays).toBeUndefined()
  })

  it('applies a single overlay on top of merged project config', async () => {
    const platformRoot = path.join(tmpDir, 'o2-platform')
    const projectRoot = path.join(tmpDir, 'o2-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: { adapters: { llm: 'openai' } } })
    const overlayPath = writeOverlay(
      projectRoot,
      'pressure__overlay.jsonc',
      `{
        // pressure scenario raises broker limits
        "adapters": { "llm": "anthropic" }
      }`,
    )

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters).toEqual({ llm: 'anthropic' })
    expect(result.sources.overlays).toEqual([overlayPath])
  })

  it('merges multiple overlays in lexicographic order, later wins on conflict', async () => {
    const platformRoot = path.join(tmpDir, 'o3-platform')
    const projectRoot = path.join(tmpDir, 'o3-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: { adapters: { llm: 'openai', cache: 'redis' } } })
    const aPath = writeOverlay(projectRoot, 'a.jsonc', '{ "adapters": { "llm": "anthropic" } }')
    const bPath = writeOverlay(projectRoot, 'b.jsonc', '{ "adapters": { "llm": "vibeproxy", "storage": "fs" } }')

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters).toEqual({
      llm: 'vibeproxy',  // b.jsonc wins over a.jsonc
      cache: 'redis',     // from project config, untouched
      storage: 'fs',      // added by b.jsonc
    })
    expect(result.sources.overlays).toEqual([aPath, bPath])
  })

  it('overlay arrays replace by default', async () => {
    const platformRoot = path.join(tmpDir, 'o4-platform')
    const projectRoot = path.join(tmpDir, 'o4-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, {
      platform: { adapters: { llm: ['openai', 'vibeproxy'] } },
    })
    writeOverlay(projectRoot, 'p.jsonc', '{ "adapters": { "llm": ["anthropic"] } }')

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters?.llm).toEqual(['anthropic'])
  })

  it('overlay kb:merge append concatenates arrays', async () => {
    const platformRoot = path.join(tmpDir, 'o5-platform')
    const projectRoot = path.join(tmpDir, 'o5-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, {
      platform: { adapters: { llm: ['openai'] } },
    })
    writeOverlay(
      projectRoot,
      'p.jsonc',
      `{ "adapters": { "kb:merge": { "llm": "append" }, "llm": ["vibeproxy"] } }`,
    )

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters?.llm).toEqual(['openai', 'vibeproxy'])
  })

  it('throws when overlay breaks top-level type (e.g. adapters becomes string)', async () => {
    const platformRoot = path.join(tmpDir, 'o6-platform')
    const projectRoot = path.join(tmpDir, 'o6-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: { adapters: { llm: 'openai' } } })
    writeOverlay(projectRoot, 'bad.jsonc', '{ "adapters": "this-should-be-an-object" }')

    await expect(
      loadPlatformConfig({
        startDir: projectRoot,
        env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
        loadEnvFile: false,
      }),
    ).rejects.toThrow(/Platform config is invalid after applying overlays/)
  })

  it('propagates overlay loader diagnostics into sources.overlayDiagnostics', async () => {
    // Regression: previously the overlay step in core-runtime captured only
    // overlay paths and silently dropped `loadOverlays().diagnostics`, so a
    // malformed JSONC file was invisibly skipped. Now diagnostics are
    // exposed via sources.overlayDiagnostics for observability.
    const platformRoot = path.join(tmpDir, 'o7-platform')
    const projectRoot = path.join(tmpDir, 'o7-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: { adapters: { llm: 'openai' } } })
    writeOverlay(projectRoot, 'a-good.jsonc', '{ "adapters": { "llm": "anthropic" } }')
    writeOverlay(projectRoot, 'b-broken.jsonc', '{ this is not valid json')
    writeOverlay(projectRoot, 'c-array.jsonc', '[1, 2, 3]')

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters).toEqual({ llm: 'anthropic' })
    expect(result.sources.overlayDiagnostics).toBeDefined()
    const codes = result.sources.overlayDiagnostics!.map((d) => d.code)
    expect(codes).toContain('JSON_PARSE_FAILED')
    expect(codes).toContain('OVERLAY_NOT_OBJECT')
  })

  it('sources.overlayDiagnostics is omitted when there are no issues', async () => {
    const platformRoot = path.join(tmpDir, 'o8-platform')
    const projectRoot = path.join(tmpDir, 'o8-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: { adapters: { llm: 'openai' } } })
    writeOverlay(projectRoot, 'p.jsonc', '{ "adapters": { "llm": "x" } }')

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: { KB_PLATFORM_ROOT: platformRoot, KB_PROJECT_ROOT: projectRoot },
      loadEnvFile: false,
    })

    expect(result.sources.overlayDiagnostics).toBeUndefined()
  })
})
