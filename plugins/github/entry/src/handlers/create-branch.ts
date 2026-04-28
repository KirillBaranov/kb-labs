import { defineHandler, useEnv } from '@kb-labs/sdk'
import type { CreateBranchInput, CreateBranchOutput } from '@kb-labs/github-contracts'

function headers(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const tok = token ?? useEnv('GITHUB_WORKFLOW_TOKEN')
  if (tok) h.Authorization = `Bearer ${tok}`
  return h
}

export default defineHandler<unknown, CreateBranchInput, CreateBranchOutput>({
  async execute(ctx, input) {
    const { owner, repo, branchName, fromBranch = 'main', token } = input
    const hdrs = headers(token)

    // Get SHA of the base branch
    const refRes = await ctx.runtime.fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`,
      { headers: hdrs },
    )
    if (!refRes.ok) throw new Error(`GitHub ${refRes.status}: ${await refRes.text()}`)

    const ref = await refRes.json() as Record<string, unknown>
    const sha = (ref.object as { sha: string }).sha

    // Create the new branch (idempotent — if already exists, use it)
    const createRes = await ctx.runtime.fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
      },
    )

    if (!createRes.ok) {
      if (createRes.status === 422) {
        // Branch already exists — fetch its current SHA
        const existingRes = await ctx.runtime.fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branchName}`,
          { headers: hdrs },
        )
        if (!existingRes.ok) throw new Error(`GitHub ${existingRes.status}: ${await existingRes.text()}`)
        const existing = await existingRes.json() as Record<string, unknown>
        const existingSha = (existing.object as { sha: string }).sha
        return {
          branchName,
          sha: existingSha,
          url: `https://github.com/${owner}/${repo}/tree/${branchName}`,
        }
      }
      throw new Error(`GitHub ${createRes.status}: ${await createRes.text()}`)
    }

    return {
      branchName,
      sha,
      url: `https://github.com/${owner}/${repo}/tree/${branchName}`,
    }
  },
})
