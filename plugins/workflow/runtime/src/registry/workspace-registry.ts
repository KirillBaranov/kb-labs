import { readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import fg from 'fast-glob'
import { parse as parseYaml } from 'yaml'
import type { WorkflowSpec } from '@kb-labs/workflow-contracts'
import { WorkflowSpecSchema } from '@kb-labs/workflow-contracts'
import type { ResolvedWorkflow, WorkflowRegistry } from './types'

export interface WorkspaceWorkflowRegistryConfig {
  workspaceRoot: string
  patterns: string[]
}

/**
 * Registry for workspace workflows (from .kb/workflows glob patterns)
 */
export class WorkspaceWorkflowRegistry implements WorkflowRegistry {
  private cache: ResolvedWorkflow[] | null = null

  constructor(private readonly config: WorkspaceWorkflowRegistryConfig) {}

  async list(): Promise<ResolvedWorkflow[]> {
    if (this.cache) {
      return this.cache
    }

    const workflows: ResolvedWorkflow[] = []

    // Expand glob patterns
    const files = await fg(this.config.patterns, {
      cwd: this.config.workspaceRoot,
      absolute: true,
      onlyFiles: true,
      ignore: ['node_modules/**', 'dist/**', '.git/**'],
    })

    // Load all workflow files in parallel
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const spec = await this.loadWorkflowSpec(file)
        if (!spec) {
          return null
        }

        const relativePath = relative(this.config.workspaceRoot, file)
        const id = this.generateId(relativePath)

        return {
          id,
          source: 'workspace' as const,
          filePath: file,
          description: spec.description,
          // tags: spec.tags, // TODO: Add tags to WorkflowSpec if needed
        }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        workflows.push(result.value)
      } else if (result.status === 'rejected') {
        // Log warning but continue
        console.warn(
          '[WorkspaceWorkflowRegistry] Failed to load workflow:',
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        )
      }
    }

    this.cache = workflows
    return workflows
  }

  async resolve(id: string): Promise<ResolvedWorkflow | null> {
    // Remove workspace: prefix if present
    const cleanId = id.startsWith('workspace:') ? id.slice('workspace:'.length) : id

    const all = await this.list()
    return all.find((w) => w.id === id || w.id.endsWith(':' + cleanId)) ?? null
  }

  async refresh(): Promise<void> {
    this.cache = null
  }

  async dispose(): Promise<void> {
    // No cleanup needed for workspace registry
  }

  private async loadWorkflowSpec(
    filePath: string,
  ): Promise<WorkflowSpec | null> {
    try {
      const raw = await readFile(filePath, 'utf-8')
      const parsed = filePath.endsWith('.json')
        ? JSON.parse(raw)
        : parseYaml(raw)

      const result = WorkflowSpecSchema.safeParse(parsed)
      if (!result.success) {
        return null
      }

      return result.data
    } catch {
      return null
    }
  }

  private generateId(relativePath: string): string {
    // Remove extension and convert to workspace: ID
    const withoutExt = relativePath.replace(/\.(yml|yaml|json)$/, '')
    // Normalize path separators
    const normalized = withoutExt.replace(/\\/g, '/')
    return `workspace:${normalized}`
  }
}

