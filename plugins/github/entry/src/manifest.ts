import { combinePermissions, kbPlatformPreset } from '@kb-labs/sdk'

const permissions = combinePermissions()
  .with(kbPlatformPreset)
  .with({
    network: {
      fetch: ['https://api.github.com/*'],
    },
    env: {
      read: ['GITHUB_WORKFLOW_TOKEN'],
    },
  })
  .build()

const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/github',
  version: '0.1.0',
  display: {
    name: 'GitHub',
    description: 'GitHub integration — fetch issues, post comments, create branches and PRs',
    tags: ['github', 'integration', 'workflow'],
  },
  platform: { requires: [], optional: [] },
  workflows: {
    handlers: [
      {
        id: 'fetch-issue',
        handler: './dist/handlers/fetch-issue.js#default',
        describe: 'Fetch a GitHub issue by number',
      },
      {
        id: 'post-comment',
        handler: './dist/handlers/post-comment.js#default',
        describe: 'Post a comment on a GitHub issue or PR',
      },
      {
        id: 'create-branch',
        handler: './dist/handlers/create-branch.js#default',
        describe: 'Create a new branch from a base branch',
      },
      {
        id: 'create-pr',
        handler: './dist/handlers/create-pr.js#default',
        describe: 'Create a pull request and optionally link it to an issue',
      },
    ],
  },
} as const

export default { ...manifest, permissions }
