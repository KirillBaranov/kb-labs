import { describe, it, expect } from 'vitest'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { findRepoRoot, discoverSubRepos } from '../repo'

async function mkd(prefix = 'kb-core-sys-repo-') {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix))
}

describe('findRepoRoot', () => {
  it('finds directory containing any marker (e.g., .git) when called from subdir', async () => {
    const root = await mkd()
    const sub = path.join(root, 'a/b/c')
    await fsp.mkdir(sub, { recursive: true })
    await fsp.mkdir(path.join(root, '.git'))

    const found = await findRepoRoot(sub)
    expect(found).toBe(root)
  })

  it('falls back to start directory if no marker is found up the tree', async () => {
    const start = await mkd()
    const found = await findRepoRoot(start)
    // Implementation returns the start directory as fallback
    expect(found).toBe(path.resolve(start))
  })
})


describe('discoverSubRepos', () => {
  it('parses .gitmodules and returns SubRepo objects', async () => {
    const root = await mkd()
    await fsp.writeFile(
      path.join(root, '.gitmodules'),
      '[submodule "my-plugin"]\n\tpath = plugins/my-plugin\n\turl = git@example.com\n',
    )
    await fsp.mkdir(path.join(root, 'plugins/my-plugin'), { recursive: true })

    const repos = discoverSubRepos(root)
    expect(repos).toHaveLength(1)
    expect(repos[0]).toMatchObject({
      path: 'plugins/my-plugin',
      category: 'plugins',
      name: 'my-plugin',
    })
    expect(repos[0]!.absolutePath).toBe(path.join(root, 'plugins/my-plugin'))
  })

  it('falls back to flat layout scan when .gitmodules is absent', async () => {
    const root = await mkd()
    await fsp.mkdir(path.join(root, 'my-sub/.git'), { recursive: true })

    const repos = discoverSubRepos(root)
    expect(repos).toHaveLength(1)
    expect(repos[0]).toMatchObject({ path: 'my-sub', category: '', name: 'my-sub' })
    expect(repos[0]!.absolutePath).toBe(path.join(root, 'my-sub'))
  })

  it('returns empty array when no sub-repos exist', async () => {
    const root = await mkd()
    expect(discoverSubRepos(root)).toEqual([])
  })
})
