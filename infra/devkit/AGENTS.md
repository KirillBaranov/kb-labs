# KB Labs Agents

The following agents are standardized across KB Labs projects. They live in this DevKit and can be synced into any repo.

| Agent              | Folder                         | Purpose                                                        |
|--------------------|--------------------------------|----------------------------------------------------------------|
| DevKit Maintainer  | `agents/devkit-maintainer`     | Enforce unified tooling (tsconfig, eslint, prettier, vitest, tsup, CI). |
| Test Generator     | `agents/test-generator`        | Generate and maintain pragmatic unit tests.                    |
| Docs Drafter       | `agents/docs-drafter`          | Draft and update README/CONTRIBUTING/ADR docs.                 |
| Release Manager    | `agents/release-manager`       | Prepare release plans, changelog, and GitHub releases.         |

> These are **descriptions and prompts** to bootstrap Cursor Agents quickly.  
> Use the `agents:sync` command in product repos to copy the latest agent definitions from this DevKit.

## Agent Structure

Each agent includes:

- **`prompt.md`** — AI instructions and context for the agent
- **`runbook.md`** — Step-by-step procedures and workflows
- **`context.globs`** — File patterns for context (optional)
- **`permissions.yml`** — Access permissions and restrictions (optional)

## Usage

### Syncing Agents

To sync agents into your project:

```bash
# Copy all agent definitions from DevKit
pnpm agents:sync

# Or use the sync tool directly
npx kb-devkit-sync agents
```

Agents are synced to `.kb/devkit/agents/` in your project.

> **Note:** `.kb` is the common ecosystem folder. `devkit` is the product namespace. Each product decides what to store in their namespace. Product-specific agents can be added to `.kb/<product>/agents/` if needed.

### Agent Configuration

Agents are designed for Cursor AI but can be adapted for other IDE assistants:

- **Cursor**: Place in `.cursor/agents/` directory
- **GitHub Copilot Chat**: Adapt prompts for chat interface
- **Other IDEs**: Modify prompts as needed for your environment

### Customization

You can customize agents by:

1. **Extending prompts**: Add project-specific context to `prompt.md`
2. **Modifying runbooks**: Update procedures in `runbook.md` for your workflow
3. **Adjusting context**: Modify `context.globs` to include relevant files
4. **Setting permissions**: Configure `permissions.yml` for security

## Agent Details

### DevKit Maintainer

**Purpose**: Enforce unified tooling across KB Labs projects

**Key Responsibilities**:
- Ensure consistent tsconfig, eslint, prettier, vitest, tsup configurations
- Validate CI/CD workflows and drift checks
- Maintain DevKit synchronization
- Enforce coding standards and best practices

**Context**: Configuration files, CI workflows, package.json, DevKit sync files

### Test Generator

**Purpose**: Generate and maintain pragmatic unit tests

**Key Responsibilities**:
- Create comprehensive test suites for new features
- Maintain existing tests and update when code changes
- Ensure good test coverage and quality
- Follow testing best practices and patterns

**Context**: Source code files, existing tests, test configuration

### Docs Drafter

**Purpose**: Draft and update documentation

**Key Responsibilities**:
- Create and maintain README files
- Update CONTRIBUTING guidelines
- Draft Architecture Decision Records (ADRs)
- Ensure documentation is clear and up-to-date

**Context**: Project files, existing documentation, code structure

### Release Manager

**Purpose**: Prepare release plans, changelog, and GitHub releases

**Key Responsibilities**:
- Create release plans and versioning strategies
- Generate changelogs from commit history
- Prepare GitHub releases with proper tagging
- Coordinate release processes across teams

**Context**: Git history, package.json, release notes, version tags

## Best Practices

1. **Keep agents focused**: Each agent should have a clear, specific purpose
2. **Update regularly**: Sync agents frequently to get latest improvements
3. **Customize thoughtfully**: Adapt agents for your project while maintaining consistency
4. **Test thoroughly**: Validate agent behavior before deploying to team
5. **Document changes**: Keep track of customizations and their rationale

## Troubleshooting

### Common Issues

- **Agent not responding**: Check that agent files are properly synced and accessible
- **Incorrect context**: Verify `context.globs` patterns match your project structure
- **Permission errors**: Review `permissions.yml` settings
- **Outdated agents**: Run `pnpm agents:sync` to get latest versions

### Getting Help

- Check agent runbooks for detailed procedures
- Review DevKit documentation for sync and configuration options
- Open issues for agent-specific problems or suggestions
