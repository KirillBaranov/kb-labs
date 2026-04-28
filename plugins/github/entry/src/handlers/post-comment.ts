import { defineHandler, useEnv } from '@kb-labs/sdk'
import type { PostCommentInput, PostCommentOutput } from '@kb-labs/github-contracts'

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

export default defineHandler<unknown, PostCommentInput, PostCommentOutput>({
  async execute(ctx, input) {
    const { owner, repo, issueNumber, body, token } = input

    const res = await ctx.runtime.fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      { method: 'POST', headers: headers(token), body: JSON.stringify({ body }) },
    )
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`)

    const comment = await res.json() as Record<string, unknown>
    return {
      commentId: comment.id as number,
      url: comment.html_url as string,
    }
  },
})
