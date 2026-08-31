/**
 * KB Labs Release Manager - Manifest V3
 *
 * Migration from V2 to V3 following best practices from V3-MIGRATION-GUIDE.md
 *
 * Key changes:
 * - Schema: kb.plugin/3
 * - Commands use handler#default suffix
 * - Commands have handlerPath field
 * - Permissions moved to manifest level
 * - All imports from @kb-labs/sdk
 */

import {
  defineCommandFlags,
  combinePermissions,
  gitWorkflowPreset,
  kbPlatformPreset,
  npmPublishPreset,
  ciEnvironmentPreset,
} from '@kb-labs/sdk';
import {
  RELEASE_BASE_PATH,
  RELEASE_ROUTES,
  RELEASE_CACHE_PREFIX,
} from '@kb-labs/release-manager-contracts';
import { CHECKS_CONCURRENCY } from '@kb-labs/release-manager-core';

/**
 * Build permissions using presets:
 * - gitWorkflow: HOME, USER, GIT_*, SSH_* for git/changelog operations
 * - kbPlatform: KB_* env vars and .kb/ directory
 * - npmPublish: NPM_TOKEN, npm registry access for publishing
 * - ciEnvironment: CI, GITHUB_TOKEN for CI/CD integrations
 * - Custom: KB_RELEASE_*, additional fs paths
 */
const pluginPermissions = combinePermissions()
  .with(gitWorkflowPreset)
  .with(kbPlatformPreset)
  .with(npmPublishPreset)
  .with(ciEnvironmentPreset)
  .withEnv(['KB_RELEASE_*', 'NODE_ENV'])
  .withFs({
    mode: 'readWrite',
    allow: [
      '.kb/release/**',
      'package.json',
      '**/package.json',
      'pnpm-workspace.yaml',
      '**/*.yml',
      '**/*.yaml',
      'CHANGELOG.md',
      '**/CHANGELOG.md',
    ],
    // Note: deny patterns (*.key, *.secret, node_modules) are enforced by platform
  })
  .withShell({
    allow: ['bash', 'git', 'npm', 'npx', 'pnpm'], // release gates/builds plus git, npm publishing, and configurable pnpm scripts
    // Must match CHECKS_CONCURRENCY (manager-core/src/checks.ts): the process
    // broker grants at most this many concurrent shells per plugin, so a lower
    // value here throttles perPackage check batches to 1-at-a-time and can
    // blow their timeout; a higher value defeats the plugin's own batching.
    maxConcurrent: CHECKS_CONCURRENCY,
  })
  .withPlatform({
    cache: [RELEASE_CACHE_PREFIX], // Cache namespace prefix for plan/changelog caching
    llm: true,                       // LLM for changelog generation
    analytics: true,                 // Track release events
  })
  .withQuotas({
    timeoutMs: 1800000, // 30 min for complex releases (167 packages)
    memoryMb: 4096, // full platform build:affected across 167 packages peaked at ~2.05GB on a CI runner, right at the old 2048 ceiling
    cpuMs: 300000, // 5 min CPU time
  })
  .build();

export const manifest = {
  schema: 'kb.plugin/3',
  id: '@kb-labs/release',
  version: '0.1.0',

  display: {
    name: 'Release Manager',
    description: 'Plan, execute, and audit releases across your workspace',
    tags: ['release', 'publish', 'versioning'],
  },

  // Platform requirements
  platform: {
    requires: ['storage', 'cache'], // cache required for plan/changelog caching
    optional: ['llm', 'analytics', 'logger'],
  },

  // Setup handler - V3 pattern
  setup: {
    handler: './setup/handler.js#default',
    describe: 'Prepare the .kb/release workspace (plans, reports, backups).',
  },

  // CLI commands - V3 format
  cli: {
    groupMeta: [
      { path: 'release', describe: 'Release management commands' },
    ],
    commands: [
      // release:plan - Reserve a version and prepare a release candidate intent
      {
        path: 'release plan',
        category: 'Pipeline',
        describe: 'Analyze changes, reserve a version and prepare a release candidate intent',
        operationType: 'analyze' as const,
        longDescription:
          'Resolves the requested channel, allocates a final monotonic SemVer from the release version ledger '
          + '(never reusing a version, even one that was reserved and abandoned), freezes the changelog bytes, and '
          + 'writes the candidate intent that `release stage` consumes. `--target experimental` is rejected: the '
          + 'channel is reserved in the contracts but has no implementation in this release contract.',

        handler: './cli/commands/plan.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          flow: { type: 'string', description: 'Named release flow from release.flows' },
          bump: {
            type: 'string',
            choices: ['patch', 'minor', 'major', 'auto'] as const,
            default: 'auto',
            description: 'Version bump strategy',
          },
          target: {
            type: 'string',
            choices: ['canary', 'stable', 'experimental'] as const,
            default: 'canary',
            description:
              'Requested release channel. canary allocates a final version; stable is a promotion, not a candidate; '
              + 'experimental is reserved and rejected.',
          },
          channel: {
            type: 'string',
            choices: ['canary', 'stable', 'experimental'] as const,
            description: 'Deprecated alias for --target',
          },
          json: { type: 'boolean', description: 'Print the candidate as JSON' },
        }),

        examples: [
          'kb release plan --flow platform --target canary --json',
          'kb release plan --scope packages/*',
          'kb release plan --bump minor',
        ],
      },

      // release:run - Execute release process
      {
        path: 'release run',
        category: 'Pipeline',
        describe: 'Execute release process (plan, check, publish)',
        operationType: 'execute' as const,
        longDescription: 'Run full release: plan versions, run checks, publish packages',

        handler: './cli/commands/run.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope or glob pattern (e.g. @my-org/core, packages/*)' },
          bump: {
            type: 'string',
            choices: ['patch', 'minor', 'major', 'auto'] as const,
            default: 'auto',
            description: 'Version bump override (default: auto-detect from commits)',
          },
          strict: { type: 'boolean', description: 'Fail on any check failure' },
          channel: {
            type: 'string',
            choices: ['stable', 'canary'] as const,
            default: 'stable',
            description: 'Release channel — canary publishes straight to npm under a prerelease tag, no git commit/tag',
          },
          'dry-run': { type: 'boolean', description: 'Simulate release without publishing or tagging' },
          'skip-checks': { type: 'boolean', description: 'Skip pre-release checks' },
          'skip-build': { type: 'boolean', description: 'Skip build step' },
          'skip-verify': { type: 'boolean', description: 'Skip artifact verification (npm pack check)' },
          'skip-publish': {
            type: 'boolean',
            description: 'Prepare-only: build, version, changelog, git commit/tag — never publish to npm. No npm credentials required. Pair with a tag-triggered CI job running `kb release promote`.',
          },
          'no-verify': { type: 'boolean', description: 'Pass --no-verify to git push (bypasses pre-push hooks)' },
          yes: { type: 'boolean', description: 'Skip confirmation prompt — for CI/headless mode' },
          json: { type: 'boolean', description: 'Print result as JSON' },
        }),

        examples: [
          'kb release run',
          'kb release run --dry-run',
          'kb release run --yes',
          'kb release run --yes --no-verify',
          'kb release run --bump minor --yes',
          'kb release run --scope @my-org/core',
          'kb release run --skip-checks --skip-build',
          'kb release run --strict --json',
          'kb release run --channel canary --yes',
          'kb release run --flow platform --skip-publish --yes',
        ],
      },

      // release:publish - Publish packages to npm
      {
        path: 'release publish',
        category: 'Publish',
        describe: 'Publish packages to npm registry',
        operationType: 'execute' as const,
        longDescription: 'Smart npm publish with interactive 2FA support and better UX',

        handler: './cli/commands/publish.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          otp: { type: 'string', description: 'One-time password (optional, will prompt if needed)' },
          'dry-run': { type: 'boolean', description: 'Simulate publish without actually publishing' },
          tag: { type: 'string', description: 'NPM dist-tag (default: latest)' },
          access: {
            type: 'string',
            choices: ['public', 'restricted'] as const,
            description: 'Package access level',
          },
          token: { type: 'string', description: 'NPM auth token (overrides NPM_TOKEN env)' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release publish',
          'kb release publish --scope @kb-labs/core',
          'kb release publish --otp 123456',
          'kb release publish --dry-run',
          'kb release publish --tag next --access public',
        ],
      },

      // release:stage - Apply planned mutations in a disposable worktree
      {
        path: 'release stage',
        category: 'Publish',
        describe: 'Apply an intent\'s planned mutations in a disposable worktree and return its treeSha256',
        operationType: 'mutate' as const,
        longDescription:
          'Creates a one-shot git worktree detached at the intent\'s plannedCommit, applies only the planned '
          + 'version, changelog and internal dependency mutations there, and returns treeSha256 — the digest of '
          + 'the tree the release artifacts will actually be built from. `master` and the primary working tree are '
          + 'never touched, so an abandoned or rejected release costs a temp directory and nothing else. The '
          + 'derived mutation set is checked against the intent\'s mutationSha256 before anything is written.',

        handler: './cli/commands/stage.js#default',

        flags: defineCommandFlags({
          intent: { type: 'string', description: 'Path to the intent.json `release plan` produced' },
          changelogs: { type: 'string', description: 'JSON file mapping worktree-relative target path to the frozen changelog file' },
          discard: { type: 'boolean', description: 'Destroy this candidate\'s staging worktree and forget its state' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release stage --intent .kb/release/intent.json --json',
          'kb release stage --intent .kb/release/intent.json --discard',
        ],
      },

      // release:package - Produce the release's exact bytes from the staged tree
      {
        path: 'release package',
        category: 'Publish',
        describe: 'Package the intent\'s exact package set from the staged worktree into a bundle directory',
        operationType: 'execute' as const,
        longDescription:
          'Packs tarballs (and copies selected binaries) from the staged worktree into --out. Operates only on '
          + 'the intent\'s exact package set and rejects a tree digest different from the staged treeSha256, a '
          + 'changed package list, or a version mismatch between the intent and the staged tree. Produces a '
          + 'packaging record for `release seal`; it is not yet a sealed bundle.',

        handler: './cli/commands/package.js#default',

        flags: defineCommandFlags({
          intent: { type: 'string', description: 'Path to the same intent.json `release stage` was run with' },
          out: { type: 'string', description: 'Bundle directory to write tarballs and binaries into' },
          'binaries-dir': { type: 'string', description: 'Directory holding built binaries to ship inside the bundle' },
          'binary-checksums': { type: 'string', description: 'GoReleaser checksums file, normalized into the binary manifest' },
          'binary-repository': { type: 'string', description: 'owner/repo the binary release assets belong to' },
          'binary-release-tag': { type: 'string', description: 'Release tag the binary assets were published under' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release package --intent .kb/release/intent.json --out .kb/release/bundle --json',
        ],
      },

      // release:seal - Build the index and graph, then seal the bundle
      {
        path: 'release seal',
        category: 'Publish',
        describe: 'Build the release index and compatibility graph over packaged artifacts and seal the bundle',
        operationType: 'execute' as const,
        longDescription:
          'Reads the exact local artifacts, builds the compatibility graph and the release index over them, and '
          + 'writes provenance.json plus the canonical bundle.json carrying bundleSha256. Provenance carries no '
          + 'releaseCommit: the commit does not exist yet at sealing time, so the binding runs the other way and '
          + '`release commit` checks the commit it creates against provenance.treeSha256. Sealing runs the full '
          + 'bundle verifier over its own output and fails rather than returning a bundle `release verify-bundle` '
          + 'would reject.',

        handler: './cli/commands/seal.js#default',

        flags: defineCommandFlags({
          bundle: { type: 'string', description: 'Bundle directory `release package` wrote' },
          channel: { type: 'string', description: 'Channel label recorded in the release index (default: canary)' },
          registry: { type: 'string', description: 'Registry the index resolves tarball URLs against' },
          'platform-package': { type: 'string', description: 'Package carrying the platform version line (default: @kb-labs/core-runtime)' },
          'sdk-package': { type: 'string', description: 'Package carrying the SDK version line (default: @kb-labs/sdk)' },
          'platform-requires': { type: 'string', description: 'Comma-separated capabilities the platform requires at install time' },
          'platform-member-packages': { type: 'string', description: 'Comma-separated packages that must travel with the platform' },
          'platform-adapter-config': { type: 'string', description: 'JSON adapter map sealed into the platform configuration' },
          'platform-adapter-options': { type: 'string', description: 'JSON adapter options sealed into the platform configuration' },
          'sealer-bin': { type: 'string', description: 'Prebuilt kb-create-release-index binary (defaults to `go run` in tools/kb-create)' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release seal --bundle .kb/release/bundle --json',
          'kb release seal --bundle /tmp/b --channel canary --json',
        ],
      },

      // release:commit - Bind a real commit to an already-sealed bundle
      {
        path: 'release commit',
        category: 'Publish',
        describe: 'Create the release commit from the staged worktree and bind it to the sealed bundle\'s tree digest',
        operationType: 'mutate' as const,
        longDescription:
          'Creates the release commit (and optionally its annotated tag) inside the same staged worktree the '
          + 'bundle was built in, then refuses the result unless the new commit\'s tree digest equals the sealed '
          + 'provenance.treeSha256 — which is what proves the commit describes the bytes that were actually built '
          + 'and verified. Conceptually runs only after approval; the approval gate itself belongs to Workflow.',

        handler: './cli/commands/commit.js#default',

        flags: defineCommandFlags({
          bundle: { type: 'string', description: 'Sealed bundle directory the commit must match' },
          tag: { type: 'string', description: 'Annotated tag to anchor the release commit (omitted means commit only)' },
          message: { type: 'string', description: 'Commit message override' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release commit --bundle .kb/release/bundle --json',
          'kb release commit --bundle .kb/release/bundle --tag platform-v2.119.0',
        ],
      },

      // release:clean-install - Shared install-verification used by both
      // check-pack-install.sh and `release stage`
      {
        path: 'release clean install',
        category: 'Publish',
        describe: 'Install a packed tarball into a throwaway consumer and confirm it imports cleanly',
        operationType: 'execute' as const,
        longDescription:
          'Installs --tarball into a fresh, outside-the-workspace consumer project and confirms --name can be ' +
          'imported afterward. Shared by check-pack-install.sh (local release gate) and `release stage` (CI publish ' +
          'path) so both use identical verification — catches an already-published PEER dependency that is itself ' +
          'broken, which static manifest checks cannot see. Surfaces the real failure reason via @npmcli/arborist ' +
          'directly; plain `npm install` swallows this exact failure class as an unhandled rejection with no usable error.',

        handler: './cli/commands/verify-clean-install.js#default',

        flags: defineCommandFlags({
          tarball: { type: 'string', description: 'Path to the packed tarball to install' },
          name: { type: 'string', description: 'Package name to import after install' },
          json: { type: 'boolean', description: 'Output in JSON format' },
          additionalTarballs: {
            type: 'string',
            description:
              'Comma-separated tarball paths for workspace siblings. Forces pnpm to install these exact local ' +
              'artifacts via pnpm.overrides instead of resolving the same package names from the real npm registry ' +
              '— required with --package-manager pnpm to avoid silently testing an already-published, possibly ' +
              'stale, version of an in-repo sibling.',
          },
          packageManager: {
            type: 'string',
            description: '"pnpm" enables the additionalTarballs override path; "npm" (default) keeps the plain Arborist install.',
          },
        }),

        examples: [
          'kb release clean install --tarball ./kb-labs-sdk-2.115.0.tgz --name @kb-labs/sdk',
          'kb release clean install --tarball ./a.tgz --name @kb-labs/a --package-manager pnpm --additional-tarballs ./b.tgz,./c.tgz',
        ],
      },

      // release:promote - Promote an already-released version to npm
      {
        path: 'release promote',
        category: 'Publish',
        describe: 'Promote already-released package versions to npm (no re-bump, no rebuild)',
        operationType: 'execute' as const,
        longDescription:
          'Publishes the CURRENT on-disk package.json versions to npm — no version bump, no rebuild. ' +
          'Intended to run after `release run --channel stable` (typically targeting Verdaccio via ' +
          'config.registry): once that run is verified, `release promote` pushes the exact same, ' +
          'already-committed versions to npm under the stable dist-tag.',

        handler: './cli/commands/promote.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          flow: { type: 'string', description: 'Named flow — selects packages the same way `release run --flow` does (e.g. excludes sdk from platform)' },
          tag: { type: 'string', description: 'npm dist-tag override (default: config.publish.stableTag, falls back to "latest")' },
          registry: { type: 'string', description: 'Registry override (default: config.publish.npmRegistry, falls back to real npm)' },
          otp: { type: 'string', description: 'One-time password (optional, will prompt if needed)' },
          'dry-run': { type: 'boolean', description: 'Simulate promote without actually publishing' },
          access: {
            type: 'string',
            choices: ['public', 'restricted'] as const,
            description: 'Package access level',
          },
          token: { type: 'string', description: 'NPM auth token (overrides NPM_TOKEN env)' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release promote',
          'kb release promote --flow platform',
          'kb release promote --flow sdk',
          'kb release promote --scope @kb-labs/core',
          'kb release promote --dry-run',
          'kb release promote --tag next',
        ],
      },

      // release:deliver - Ship a verified sealed bundle to a target (npm)
      {
        path: 'release deliver',
        category: 'Publish',
        describe: 'Ship a verified sealed bundle\'s exact tarballs to a target — no packing, no rebuild',
        operationType: 'execute' as const,
        longDescription:
          'CI-side half of the "plugin prepares, CI delivers" release flow: verifies the sealed bundle at ' +
          '--bundle and ships exactly the tarballs its provenance lists to --target (only "npm" is implemented ' +
          'this pass). An unverified manifest path is never accepted as a release decision. ' +
          'Resolves {flow, channel} from --release-tag via release.flows[*].tagPattern so CI never needs to ' +
          'guess the flow itself — just pass the tag. Verifies the delivery against the real registry ' +
          'afterwards (with retry, since real npm has propagation lag); never attempts npm unpublish on a ' +
          'verification failure — that is a human decision.',

        handler: './cli/commands/deliver.js#default',

        flags: defineCommandFlags({
          'release-tag': { type: 'string', description: 'Git tag to resolve {flow, channel} from (via release.flows[*].tagPattern) — alternative to --flow' },
          flow: { type: 'string', description: 'Named flow — alternative to --release-tag' },
          target: { type: 'string', choices: ['npm'] as const, description: 'Delivery target (default: npm — the only target implemented this pass)' },
          bundle: { type: 'string', description: 'Sealed bundle directory produced by `release package` + `release seal`' },
          'expected-sha256': { type: 'string', description: 'bundleSha256 the approval was granted over — rejects a differently-sealed bundle' },
          tag: { type: 'string', description: 'npm dist-tag override (default: config.publish.stableTag, falls back to "latest")' },
          registry: { type: 'string', description: 'Registry override (default: config.publish.npmRegistry, falls back to real npm)' },
          otp: { type: 'string', description: 'One-time password (optional, will prompt if needed)' },
          'dry-run': { type: 'boolean', description: 'Simulate delivery without actually publishing' },
          access: {
            type: 'string',
            choices: ['public', 'restricted'] as const,
            description: 'Package access level',
          },
          token: { type: 'string', description: 'NPM auth token (overrides NPM_TOKEN env)' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release deliver --release-tag platform-v2.105.0 --bundle .kb/release/bundle --target npm',
          'kb release deliver --flow sdk --bundle .kb/release/bundle --target npm',
          'kb release deliver --flow sdk --bundle .kb/release/bundle --dry-run',
        ],
      },

      // release:rollback - Rollback last release
      {
        path: 'release rollback',
        category: 'Utilities',
        describe: 'Rollback last release',
        operationType: 'mutate' as const,
        longDescription: 'Restore workspace state from backup snapshot',

        handler: './cli/commands/rollback.js#default',

        flags: defineCommandFlags({
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: ['kb release rollback', 'kb release rollback --json'],
      },

      // release:report - Show last release report
      {
        path: 'release report',
        category: 'Utilities',
        describe: 'Show last release report',
        operationType: 'read' as const,
        longDescription: 'Display the most recent release execution report',

        handler: './cli/commands/report.js#default',

        flags: defineCommandFlags({
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: ['kb release report', 'kb release report --json'],
      },

      // release:changelog - Generate changelog
      {
        path: 'release changelog',
        category: 'Utilities',
        describe: 'Generate changelog from conventional commits',
        operationType: 'read' as const,
        longDescription: 'Parse git history and generate changelog with conventional commits support',

        handler: './cli/commands/changelog.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Filter to specific package' },
          flow: { type: 'string', description: 'Named release flow from release.flows' },
          from: { type: 'string', description: 'Start commit/tag' },
          to: { type: 'string', description: 'End commit/tag (default: HEAD)' },
          'since-tag': { type: 'string', description: 'Shorthand for --from <tag>' },
          format: {
            type: 'string',
            choices: ['json', 'md', 'both'] as const,
            default: 'both',
            description: 'Output format',
          },
          level: {
            type: 'string',
            choices: ['compact', 'standard', 'detailed'] as const,
            default: 'standard',
            description: 'Detail level',
          },
          template: {
            type: 'string',
            description:
              'Template name (builtin: corporate, corporate-ai, technical, compact) or custom path',
          },
          'breaking-only': { type: 'boolean', description: 'Show only breaking changes' },
          include: { type: 'string', description: 'Comma-separated types to include' },
          exclude: { type: 'string', description: 'Types to exclude' },
          'workspace-only': { type: 'boolean', description: 'Only workspace changelog' },
          'per-package': { type: 'boolean', description: 'Only per-package changelogs' },
          force: { type: 'boolean', description: 'Skip audit gate' },
          'allow-major': { type: 'boolean', description: 'Allow major bumps for experimental packages' },
          preid: { type: 'string', description: 'Pre-release identifier (rc, beta, alpha)' },
        }),

        examples: [
          'kb release changelog',
          'kb release changelog --from v1.0.0',
          'kb release changelog --format md --level detailed',
          'kb release changelog --template corporate-ai',
          'kb release changelog --template ./my-template.ts',
          'kb release changelog --breaking-only',
        ],
      },

      // release:verify - Validate release readiness
      {
        path: 'release verify',
        category: 'Validation',
        describe: 'Validate release readiness',
        operationType: 'analyze' as const,
        longDescription: 'Validate release readiness via flag gates (packages, breaking changes, commit types)',

        handler: './cli/commands/verify.js#default',

        flags: defineCommandFlags({
          'fail-if-empty': { type: 'boolean', description: 'Fail if no version bumps needed' },
          'fail-on-breaking': { type: 'boolean', description: 'Fail if breaking changes detected' },
          'allow-types': {
            type: 'string',
            description: 'Comma-separated types required (e.g., feat,fix)',
          },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release verify',
          'kb release verify --fail-if-empty',
          'kb release verify --allow-types feat,fix',
        ],
      },

      // release:verify-bundle - Validate an already-sealed bundle directory
      {
        path: 'release verify-bundle',
        category: 'Validation',
        describe: 'Validate a sealed release bundle directory against every bundle verification rule',
        operationType: 'analyze' as const,
        longDescription:
          'Pure validation of an already-produced bundle directory: npm manifest ↔ tarball correspondence and hashes, '
          + 'binary targets present in the compatibility graph, cross-artifact version and provenance consistency, '
          + 'graph edges and platform profiles resolvable, closed file inventory, and mandatory classification of every '
          + 'planned package. Produces nothing and repairs nothing. Mandatory immediately after `release seal` and before '
          + 'a bundle locator is handed to Workflow — everything downstream trusts these bytes, so this is the last '
          + 'cheap place to reject an inconsistency.',

        handler: './cli/commands/verify-bundle.js#default',

        flags: defineCommandFlags({
          bundle: { type: 'string', description: 'Path to the sealed bundle directory (must contain bundle.json and provenance.json)' },
          'expected-sha256': { type: 'string', description: 'Bundle digest an approval was granted over — rejects a differently-sealed but internally consistent bundle' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release verify-bundle --bundle .kb/release/bundle --json',
          'kb release verify-bundle --bundle /tmp/b --expected-sha256 <digest>',
        ],
      },

      // release:exception:create - break-glass, replaces --skip-checks
      {
        path: 'release exception create',
        category: 'Validation',
        describe: 'Create a break-glass check exception (replaces --skip-checks)',
        operationType: 'execute' as const,
        longDescription:
          'Waives named checks for one candidate. Requires a reason, an operator identity and a TTL, and writes an '
          + 'exception document rather than flipping a flag. Creating one irreversibly forbids stable promotion of '
          + 'that candidate — expiry does not restore eligibility. No second approval is required; the permanent '
          + 'loss of stable eligibility is the control. CI never receives an override flag.',

        handler: './cli/commands/exception.js#default',

        flags: defineCommandFlags({
          candidate: { type: 'string', description: 'Candidate id the exception applies to' },
          flow: { type: 'string', description: 'Release flow' },
          check: { type: 'string', array: true, description: 'Check id(s) to waive (repeatable or comma-separated)' },
          reason: { type: 'string', description: 'Why the gate is being waived — recorded verbatim' },
          operator: { type: 'string', description: 'Operator identity accepting the trade-off' },
          ttlHours: { type: 'number', description: 'Exception lifetime in hours (default 24, max 168)' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release exception create --flow platform --candidate platform-abc123 '
          + '--check source.pack-clean-install --reason "registry outage, canary only" --operator kirill --ttl-hours 6',
        ],
      },

      // release:deliver-request — the entire CI surface of the release train (PR 6)
      {
        path: 'release deliver-request',
        category: 'Pipeline',
        describe: 'Execute one ReleaseDeliveryRequest and emit DeliveryEvidence',
        operationType: 'execute' as const,
        longDescription:
          'The only command the delivery workflow runs. It takes a kb.release-delivery-request/1 document — '
          + '{receiptId, candidateId, bundle:{uri,sha256}, operation} plus the pointer preconditions where the '
          + 'operation needs them — verifies the externally supplied bundle digest before reading any bundle '
          + 'content, re-verifies the sealed bundle against all seven §6A.2 rules, and then publishes exactly what '
          + 'it was handed: npm tarballs under a unique candidate dist-tag, immutable binary/index/descriptor '
          + 'assets, and the already-sealed channel pointer through a conditional write. It reads remote state '
          + 'before every publish, so identical bytes are a success and different bytes at the same identity are a '
          + 'hard conflict; nothing is ever overwritten. It is given no receipt store, ledger or lease, so a runner '
          + 'holding delivery credentials still cannot write operational state.',

        handler: './cli/commands/deliver-request.js#default',

        flags: defineCommandFlags({
          request: { type: 'string', description: 'Path to the delivery request document, or "-" for stdin' },
          'cas-dir': { type: 'string', description: 'Mutable-document store root (or KB_RELEASE_CAS_DIR)' },
          repository: { type: 'string', description: 'owner/repo holding immutable release assets (or GITHUB_REPOSITORY)' },
          registry: { type: 'string', description: 'npm registry base URL' },
          'run-id': { type: 'string', description: 'CI run identifier, appended to the request-derived correlation id' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release deliver-request --request delivery-request.json --json',
        ],
      },

      // release:candidate — drive the candidate receipt state machine (PR 5)
      {
        path: 'release candidate',
        category: 'Pipeline',
        describe: 'Drive a release candidate receipt to its next gate or terminal state',
        operationType: 'execute' as const,
        longDescription:
          'The Workflow calls this twice — before and after the approval step — with identical arguments, because '
          + 'the receipt, not argv, knows where the operation is. It runs plan → source checks → stage → package → '
          + 'seal → verify-bundle, renders the release map over the sealed bundle, and stops for the single human '
          + 'approval. After `kb release approve` records that approval it continues through commit, artifact '
          + 'delivery, public smoke and canary activation. A transient delivery failure parks the receipt in '
          + 'needs-attention with the version intact; an artifact or functional failure rejects it and burns the '
          + 'version. Today only --dry-run runs end to end: the CI half of the delivery plane exists, but the '
          + 'Workflow-side adapter that dispatches release-deliver.yml and the endpoints it writes through are '
          + 'not deployed, so a live run refuses rather than silently using fakes.',

        handler: './cli/commands/candidate.js#default',

        flags: defineCommandFlags({
          flow: { type: 'string', default: 'platform', description: 'Named release flow' },
          target: { type: 'string', default: 'canary', description: 'Requested channel; only canary is a candidate operation' },
          receipt: { type: 'string', description: 'Existing receipt id to resume; omit to start a new operation' },
          actor: { type: 'string', description: 'Operator identity recorded on every transition (or KB_RELEASE_ACTOR)' },
          'dry-run': { type: 'boolean', description: 'Drive the state machine against the simulated pipeline and fake delivery plane' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release candidate --flow platform --target canary --dry-run --json',
          'kb release candidate --receipt rcpt-platform-1.0.0-canary --dry-run --json',
        ],
      },

      // release:approve — the one immutable approval per operation (PR 5)
      {
        path: 'release approve',
        category: 'Pipeline',
        describe: 'Record the single human approval (or refusal) for a release operation',
        operationType: 'execute' as const,
        longDescription:
          'Turns a human decision into an immutable receipt transition carrying actor, time and the digest of what '
          + 'was signed — for a candidate that is {intentSha256, bundleSha256, requestedTarget} over the already-sealed '
          + 'bundle; for a promotion it is the sealed StablePromotionPlan digest. There is deliberately no boolean '
          + 'input anywhere that means "approved". Refusing a candidate cancels it: the staging worktree is destroyed '
          + 'and the reserved version is burned, and nothing has been published.',

        handler: './cli/commands/approve.js#default',

        flags: defineCommandFlags({
          receipt: { type: 'string', description: 'Receipt id being decided' },
          actor: { type: 'string', description: 'Operator identity (or KB_RELEASE_ACTOR); an approval is never anonymous' },
          decision: { type: 'string', choices: ['approve', 'reject'] as const, default: 'approve', description: 'The decision to record' },
          comment: { type: 'string', description: 'Free-text reason recorded on the transition' },
          plan: { type: 'string', description: 'Sealed StablePromotionPlan JSON a promotion approval signs' },
          intent: { type: 'string', description: 'Intent digest, when the receipt does not already carry it' },
          'dry-run': { type: 'boolean', description: 'Act on the dry-run receipt store' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release approve --receipt rcpt-platform-1.0.0-canary --actor kirill --dry-run --json',
          'kb release approve --receipt rcpt-platform-1.0.0-canary --actor kirill --decision reject --comment "smoke looked wrong"',
        ],
      },

      // release:receipt — read the operational truth (PR 5)
      {
        path: 'release receipt',
        category: 'Validation',
        describe: 'Show a release receipt, or list receipts by state',
        operationType: 'analyze' as const,
        longDescription:
          'Read-only view of the append-only receipt store: state, transition history with actor and time, and the '
          + 'evidence behind each move. `--blocking` answers "why can I not promote to stable" by listing receipts '
          + 'parked in rollback-needs-attention, which block every subsequent stable operation until reconciled.',

        handler: './cli/commands/receipt.js#default',

        flags: defineCommandFlags({
          receipt: { type: 'string', description: 'Receipt id to show' },
          state: { type: 'string', description: 'List only receipts in this state' },
          blocking: { type: 'boolean', description: 'List receipts blocking stable promotion' },
          'dry-run': { type: 'boolean', description: 'Read the dry-run receipt store' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release receipt --receipt rcpt-platform-1.0.0-canary --json',
          'kb release receipt --state needs-attention',
          'kb release receipt --blocking',
        ],
      },

      // release:support-policy - generate and seal kb.release-support/1
      {
        path: 'release support-policy',
        category: 'Validation',
        describe: 'Generate and seal the release support policy from the version ledger',
        operationType: 'execute' as const,
        longDescription:
          'Derives supported/retired release lists from the version ledger. minimumSupported may only move forward, '
          + 'and versions that were reserved but never activated appear in neither list. Channel resolution never '
          + 'reads this document, so it can never block the primary install path.',

        handler: './cli/commands/support-policy.js#default',

        flags: defineCommandFlags({
          flow: { type: 'string', default: 'platform', description: 'Release flow the policy covers' },
          minimumSupported: { type: 'string', description: 'Oldest supported release id, e.g. platform-2.120.0' },
          legacyNotice: { type: 'string', description: 'Release-owned text the launcher renders for legacy installs' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release support-policy --flow platform --minimum-supported platform-2.120.0 --json',
        ],
      },

      // release:checks - Run pre-release checks
      {
        path: 'release checks',
        category: 'Validation',
        describe: 'Run pre-release checks from release config',
        operationType: 'analyze' as const,
        longDescription: 'Execute custom checks defined in release config (lint, test, audit, etc.)',

        handler: './cli/commands/checks.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          flow: { type: 'string', description: 'Named release flow from release.flows' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release checks',
          'kb release checks --scope @my-org/core',
          'kb release checks --json',
        ],
      },

      // release:build - Build packages
      {
        path: 'release build',
        category: 'Publish',
        describe: 'Build packages from release plan',
        operationType: 'execute' as const,
        longDescription: 'Build all packages in plan into temp dir then atomically swap dist/',

        handler: './cli/commands/build.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          flow: { type: 'string', description: 'Named release flow from release.flows' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release build',
          'kb release build --scope platform',
          'kb release build --json',
        ],
      },

      // release:pack - Verify npm artifacts
      {
        path: 'release pack',
        category: 'Publish',
        describe: 'Verify built package artifacts via npm pack',
        operationType: 'execute' as const,
        longDescription: 'Run npm pack checks: directory imports, test file leaks, missing exports, syntax errors',

        handler: './cli/commands/pack.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release pack',
          'kb release pack --scope @my-org/core',
          'kb release pack --json',
        ],
      },

      // release:version - Bump package.json versions
      {
        path: 'release version',
        category: 'Publish',
        describe: 'Bump package.json versions per release plan',
        operationType: 'mutate' as const,
        longDescription: 'Update version fields in package.json files based on computed plan',

        handler: './cli/commands/version.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          flow: { type: 'string', description: 'Named release flow from release.flows' },
          bump: {
            type: 'string',
            choices: ['patch', 'minor', 'major', 'auto'] as const,
            default: 'auto',
            description: 'Version bump override',
          },
          'dry-run': { type: 'boolean', description: 'Show what would be bumped without writing' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release version',
          'kb release version --bump minor',
          'kb release version --dry-run',
          'kb release version --scope platform --json',
        ],
      },

      // release:git - Commit, tag, push
      {
        path: 'release git',
        category: 'Publish',
        describe: 'Commit, tag, and push release changes',
        operationType: 'mutate' as const,
        longDescription: 'Create release commit, create version tags, and push to remote',

        handler: './cli/commands/git.js#default',

        flags: defineCommandFlags({
          scope: { type: 'string', description: 'Package scope (glob pattern)' },
          flow: { type: 'string', description: 'Named release flow from release.flows' },
          bump: {
            type: 'string',
            choices: ['patch', 'minor', 'major', 'auto'] as const,
            description: 'Version bump override (used to reload plan)',
          },
          'dry-run': { type: 'boolean', description: 'Skip git operations' },
          'no-verify': { type: 'boolean', description: 'Pass --no-verify to git push' },
          json: { type: 'boolean', description: 'Output in JSON format' },
        }),

        examples: [
          'kb release git',
          'kb release git --scope platform',
          'kb release git --dry-run',
          'kb release git --no-verify --json',
        ],
      },
    ],
  },

  // REST API routes - V3 format (scope-based architecture)
  rest: {
    basePath: RELEASE_BASE_PATH,
    routes: [
      // GET /scopes - List available release scopes
      {
        method: 'GET',
        path: RELEASE_ROUTES.SCOPES,
        handler: './rest/handlers/scopes-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#ScopesResponseSchema',
        },
      },
      // GET /status - Get release status for a scope
      {
        method: 'GET',
        path: RELEASE_ROUTES.STATUS,
        handler: './rest/handlers/status-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#StatusResponseSchema',
        },
      },
      // GET /plan - Get current release plan for a scope
      {
        method: 'GET',
        path: RELEASE_ROUTES.PLAN,
        handler: './rest/handlers/plan-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#PlanInputSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#PlanResponseSchema',
        },
      },
      // POST /generate - Generate release plan (LLM)
      {
        method: 'POST',
        path: RELEASE_ROUTES.GENERATE,
        handler: './rest/handlers/generate-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#GeneratePlanRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#GeneratePlanResponseSchema',
        },
        timeoutMs: 120000, // 2 minutes for LLM analysis
      },
      // DELETE /plan - Reset release plan
      {
        method: 'DELETE',
        path: RELEASE_ROUTES.RESET,
        handler: './rest/handlers/reset-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#ResetPlanRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#ResetPlanResponseSchema',
        },
      },
      // GET /changelog - Get changelog for a scope
      {
        method: 'GET',
        path: RELEASE_ROUTES.CHANGELOG,
        handler: './rest/handlers/changelog-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#ChangelogInputSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#ChangelogResponseSchema',
        },
      },
      // POST /changelog/generate - Generate changelog (LLM)
      {
        method: 'POST',
        path: RELEASE_ROUTES.CHANGELOG_GENERATE,
        handler: './rest/handlers/changelog-generate-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#GenerateChangelogRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#GenerateChangelogResponseSchema',
        },
        timeoutMs: 120000, // 2 minutes for LLM generation
      },
      // POST /changelog/save - Save edited changelog
      {
        method: 'POST',
        path: RELEASE_ROUTES.CHANGELOG_SAVE,
        handler: './rest/handlers/changelog-save-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#SaveChangelogRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#SaveChangelogResponseSchema',
        },
      },
      // POST /run - Execute release process
      {
        method: 'POST',
        path: RELEASE_ROUTES.RUN,
        handler: './rest/handlers/run-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#RunReleaseRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#RunReleaseResponseSchema',
        },
        timeoutMs: 300000, // 5 minutes for release execution
      },
      // GET /report - Get latest release report
      {
        method: 'GET',
        path: RELEASE_ROUTES.REPORT,
        handler: './rest/handlers/report-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#ReportResponseSchema',
        },
      },
      // GET /history - Get release history
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY,
        handler: './rest/handlers/history-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryResponseSchema',
        },
      },
      // GET /history/:id/report - Get historical release report
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY_REPORT,
        handler: './rest/handlers/history-report-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryReportResponseSchema',
        },
      },
      // GET /history/:id/plan - Get historical release plan
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY_PLAN,
        handler: './rest/handlers/history-plan-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryPlanResponseSchema',
        },
      },
      // GET /history/:id/changelog - Get historical changelog
      {
        method: 'GET',
        path: RELEASE_ROUTES.HISTORY_CHANGELOG,
        handler: './rest/handlers/history-changelog-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#HistoryChangelogResponseSchema',
        },
      },
      // GET /git-timeline - Get git commit timeline and version preview
      {
        method: 'GET',
        path: RELEASE_ROUTES.GIT_TIMELINE,
        handler: './rest/handlers/git-timeline-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#GitTimelineResponseSchema',
        },
      },
      // GET /preview - Preview package contents before publish
      {
        method: 'GET',
        path: RELEASE_ROUTES.PREVIEW,
        handler: './rest/handlers/preview-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#PreviewResponseSchema',
        },
      },
      // POST /build - Trigger package build
      {
        method: 'POST',
        path: RELEASE_ROUTES.BUILD,
        handler: './rest/handlers/build-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#BuildRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#BuildResponseSchema',
        },
        timeoutMs: 300000, // 5 minutes for build
      },
      // GET /checklist - Get unified release checklist status
      {
        method: 'GET',
        path: RELEASE_ROUTES.CHECKLIST,
        handler: './rest/handlers/checklist-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#ReleaseChecklistSchema',
        },
      },
      // GET /checks - Get list of configured checks (without running them)
      {
        method: 'GET',
        path: RELEASE_ROUTES.CHECKS,
        handler: './rest/handlers/get-checks-handler.js#default',
        output: {
          zod: '@kb-labs/release-manager-contracts#GetChecksResponseSchema',
        },
      },
      // POST /checks/run - Run pre-release checks from kb.config.json release.checks
      {
        method: 'POST',
        path: RELEASE_ROUTES.CHECKS_RUN,
        handler: './rest/handlers/run-checks-handler.js#default',
        input: {
          zod: '@kb-labs/release-manager-contracts#RunChecksRequestSchema',
        },
        output: {
          zod: '@kb-labs/release-manager-contracts#RunChecksResponseSchema',
        },
        timeoutMs: 600000, // 10 minutes - all checks combined
      },
    ],
  },

  // Studio V2 — Module Federation pages
  studio: {
    version: 2 as const,
    remoteName: 'releasePlugin',
    pages: [
      {
        id: 'release.overview',
        title: 'Release',
        icon: 'RocketOutlined',
        route: '/p/release',
        entry: './ReleasePage',
        order: 1,
      },
    ],
    menus: [
      {
        id: 'release',
        label: 'Release',
        icon: 'RocketOutlined',
        target: 'release.overview',
        order: 60,
      },
    ],
  },

  // Studio widgets (legacy - commented out, using new UI integration)
  // studio_legacy: {
  //   widgets: [
  //     {
  //       id: 'release.plan',
  //       kind: 'infopanel',
  //       title: 'Latest Release Plan',
  //       description: 'Shows the most recent release plan generated via `kb release plan`.',
  //       data: {
  //         source: {
  //           type: 'rest',
  //           routeId: 'plan/latest',
  //           method: 'GET',
  //         },
  //       },
  //       layoutHint: {
  //         w: 4,
  //         h: 5,
  //         minW: 3,
  //         minH: 3,
  //       },
  //     },
  //     {
  //       id: 'release.report',
  //       kind: 'cardlist',
  //       title: 'Release Report',
  //       description: 'Status of the last release execution.',
  //       data: {
  //         source: {
  //           type: 'rest',
  //           routeId: 'report/latest',
  //           method: 'GET',
  //         },
  //       },
  //       options: {
  //         layout: 'list',
  //       },
  //       layoutHint: {
  //         w: 4,
  //         h: 4,
  //         minW: 3,
  //         minH: 3,
  //       },
  //     },
  //   ],
  //   menus: [
  //     {
  //       id: 'release-menu',
  //       label: 'Release',
  //       icon: 'RocketOutlined',
  //       target: '/plugins/release/dashboard',
  //       order: 0,
  //     },
  //     {
  //       id: 'release-dashboard',
  //       label: 'Dashboard',
  //       icon: 'DashboardOutlined',
  //       parentId: 'release-menu',
  //       target: '/plugins/release/dashboard',
  //       order: 1,
  //     },
  //   ],
  //   layouts: [
  //     {
  //       id: 'release.dashboard',
  //       kind: 'grid',
  //       title: 'Release Dashboard',
  //       description: 'Overview of release planning and execution.',
  //       config: {
  //         cols: { sm: 2, md: 4, lg: 6 },
  //         rowHeight: 5,
  //       },
  //     },
  //   ],
  // },

  // Auto-detects kb.config.json section for useConfig()
  // maps to profiles[].products.release in kb.config.json
  configSection: 'release',

  capabilities: ['fs:read', 'fs:write'],

  // V3: Manifest-first permissions using composable presets
  permissions: pluginPermissions,

  // Workflow templates — composed from atomic release CLI commands
  // Registered in workflow engine and runnable via `kb workflow run plugin:@kb-labs/release/<id>`
  workflows: {
    handlers: [],
    templates: [
      {
        id: 'full-release',
        path: './workflows/templates/full-release.yaml',
        describe: 'Full release cycle: plan → checks → build → pack → approve → publish → git',
        tags: ['release', 'full'],
      },
      {
        id: 'hotfix',
        path: './workflows/templates/hotfix.yaml',
        describe: 'Quick hotfix: plan → approve → publish → git (patch bump, no checks)',
        tags: ['release', 'hotfix'],
      },
      {
        id: 'dry-run',
        path: './workflows/templates/dry-run.yaml',
        describe: 'Preview release: plan, checks, pack, changelog — no publish or git ops',
        tags: ['release', 'dry-run'],
      },
    ],
  },

  // Artifacts
  artifacts: [
    {
      id: 'release.plan.json',
      pathTemplate: '.kb/release/plan.json',
      description: 'Serialized release plan generated by `kb release plan`.',
    },
    {
      id: 'release.report.json',
      pathTemplate: '.kb/release/report.json',
      description: 'Execution report emitted by `kb release run`.',
    },
    {
      id: 'release.changelog.md',
      pathTemplate: '.kb/release/changelog.md',
      description: 'Workspace changelog output produced during release.',
    },
  ],
};

export default manifest;
