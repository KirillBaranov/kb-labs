import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { loadPlatformConfig } from '../config-loader.js'

/**
 * Create a minimal platform installation layout at `<dir>`:
 *   <dir>/node_modules/@kb-labs/cli-bin/
 *   <dir>/.kb/kb.config.json (optional)
 */
function makePlatformDir(dir: string, configContents?: unknown): void {
  mkdirSync(path.join(dir, 'node_modules', '@kb-labs', 'cli-bin'), {
    recursive: true,
  })
  if (configContents !== undefined) {
    mkdirSync(path.join(dir, '.kb'), { recursive: true })
    writeFileSync(
      path.join(dir, '.kb', 'kb.config.json'),
      JSON.stringify(configContents),
    )
  }
}

/**
 * Create a minimal user project layout at `<dir>`:
 *   <dir>/.kb/kb.config.json (optional)
 */
function makeProjectDir(dir: string, configContents?: unknown): void {
  mkdirSync(dir, { recursive: true })
  if (configContents !== undefined) {
    mkdirSync(path.join(dir, '.kb'), { recursive: true })
    writeFileSync(
      path.join(dir, '.kb', 'kb.config.json'),
      JSON.stringify(configContents),
    )
  }
}

describe('loadPlatformConfig', () => {
  let tmpDir: string
  let originalCwd: string

  beforeAll(() => {
    originalCwd = process.cwd()
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'kb-cfg-'))
  })

  afterEach(() => {
    process.chdir(tmpDir)
  })

  afterAll(() => {
    process.chdir(originalCwd)
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('loads only project config when platform has no defaults', async () => {
    const platformRoot = path.join(tmpDir, 'p1-platform')
    const projectRoot = path.join(tmpDir, 'p1-project')
    makePlatformDir(platformRoot) // no config
    makeProjectDir(projectRoot, {
      platform: {
        adapters: { llm: 'noop' },
      },
    })

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: false,
    })

    expect(result.platformRoot).toBe(path.resolve(platformRoot))
    expect(result.projectRoot).toBe(path.resolve(projectRoot))
    expect(result.sameLocation).toBe(false)
    expect(result.platformConfig.adapters).toEqual({ llm: 'noop' })
    expect(result.sources.platformDefaults).toBeUndefined()
    expect(result.sources.projectConfig).toBe(
      path.join(projectRoot, '.kb', 'kb.config.json'),
    )
  })

  it('loads only platform defaults when project has no config', async () => {
    const platformRoot = path.join(tmpDir, 'p2-platform')
    const projectRoot = path.join(tmpDir, 'p2-project')
    makePlatformDir(platformRoot, {
      platform: {
        adapters: { cache: 'redis' },
      },
    })
    makeProjectDir(projectRoot) // no config

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters).toEqual({ cache: 'redis' })
    expect(result.sources.platformDefaults).toBe(
      path.join(platformRoot, '.kb', 'kb.config.json'),
    )
    expect(result.sources.projectConfig).toBeUndefined()
  })

  it('deep-merges project config over platform defaults', async () => {
    const platformRoot = path.join(tmpDir, 'p3-platform')
    const projectRoot = path.join(tmpDir, 'p3-project')
    makePlatformDir(platformRoot, {
      platform: {
        adapters: {
          llm: 'openai',
          cache: 'redis',
        },
      },
    })
    makeProjectDir(projectRoot, {
      platform: {
        adapters: {
          llm: 'anthropic', // override
          // cache inherited
        },
      },
    })

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: false,
    })

    expect(result.platformConfig.adapters).toEqual({
      llm: 'anthropic',
      cache: 'redis',
    })
    expect(result.sources.platformDefaults).toBeDefined()
    expect(result.sources.projectConfig).toBeDefined()
  })

  it('returns empty-adapters base when neither layer exists', async () => {
    const platformRoot = path.join(tmpDir, 'p4-platform')
    const projectRoot = path.join(tmpDir, 'p4-project')
    makePlatformDir(platformRoot) // no config
    makeProjectDir(projectRoot) // no config

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: false,
    })

    // Base is { adapters: {} } so downstream code can always destructure it.
    expect(result.platformConfig).toEqual({ adapters: {} })
    expect(result.sources.platformDefaults).toBeUndefined()
    expect(result.sources.projectConfig).toBeUndefined()
  })

  it('reads single file once when platformRoot === projectRoot (dev mode)', async () => {
    const workspaceRoot = path.join(tmpDir, 'p5-workspace')
    makePlatformDir(workspaceRoot, {
      platform: {
        adapters: { llm: 'workspace-llm' },
      },
    })

    const result = await loadPlatformConfig({
      startDir: workspaceRoot,
      env: {
        KB_PLATFORM_ROOT: workspaceRoot,
        KB_PROJECT_ROOT: workspaceRoot,
      },
      loadEnvFile: false,
    })

    expect(result.sameLocation).toBe(true)
    expect(result.platformConfig.adapters).toEqual({ llm: 'workspace-llm' })
    // Only project config reported; platformDefaults left undefined so we
    // don't double-count the same file.
    expect(result.sources.platformDefaults).toBeUndefined()
    expect(result.sources.projectConfig).toBe(
      path.join(workspaceRoot, '.kb', 'kb.config.json'),
    )
  })

  it('silently degrades when config file is malformed JSON', async () => {
    const platformRoot = path.join(tmpDir, 'p6-platform')
    const projectRoot = path.join(tmpDir, 'p6-project')
    makePlatformDir(platformRoot)
    mkdirSync(path.join(projectRoot, '.kb'), { recursive: true })
    writeFileSync(
      path.join(projectRoot, '.kb', 'kb.config.json'),
      '{ this is not: valid json',
    )

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: false,
    })

    // No throw, empty-adapters base, caller can still detect the failure
    // via sources (left undefined) or by inspecting the (missing) raw config.
    expect(result.platformConfig).toEqual({ adapters: {} })
  })

  it('tolerates config without a `platform` section', async () => {
    const platformRoot = path.join(tmpDir, 'p7-platform')
    const projectRoot = path.join(tmpDir, 'p7-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { unrelated: 'data' })

    const result = await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: false,
    })

    expect(result.platformConfig).toEqual({ adapters: {} })
    // rawConfig is preserved so callers can still inspect non-platform fields
    expect(result.rawConfig).toEqual({ unrelated: 'data' })
  })

  it('loads .env file from projectRoot when loadEnvFile is true', async () => {
    const platformRoot = path.join(tmpDir, 'p8-platform')
    const projectRoot = path.join(tmpDir, 'p8-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: {} })
    writeFileSync(
      path.join(projectRoot, '.env'),
      'KB_TEST_LOADED_VAR=from-env-file\n',
    )

    // Pre-condition
    delete process.env.KB_TEST_LOADED_VAR

    await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: true,
    })

    expect(process.env.KB_TEST_LOADED_VAR).toBe('from-env-file')

    // Cleanup
    delete process.env.KB_TEST_LOADED_VAR
  })

  it('does not load .env when loadEnvFile is false', async () => {
    const platformRoot = path.join(tmpDir, 'p9-platform')
    const projectRoot = path.join(tmpDir, 'p9-project')
    makePlatformDir(platformRoot)
    makeProjectDir(projectRoot, { platform: {} })
    writeFileSync(
      path.join(projectRoot, '.env'),
      'KB_TEST_SHOULD_NOT_LOAD=nope\n',
    )

    delete process.env.KB_TEST_SHOULD_NOT_LOAD

    await loadPlatformConfig({
      startDir: projectRoot,
      env: {
        KB_PLATFORM_ROOT: platformRoot,
        KB_PROJECT_ROOT: projectRoot,
      },
      loadEnvFile: false,
    })

    expect(process.env.KB_TEST_SHOULD_NOT_LOAD).toBeUndefined()
  })
})
