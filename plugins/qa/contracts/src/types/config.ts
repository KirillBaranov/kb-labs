export interface QAPluginConfig {
  /** Path or name of the kb-devkit binary. Default: workspace-local then PATH. */
  devkitPath?: string;
  /** Maximum history entries kept per snapshot kind. Default: 50. */
  historyMaxEntries?: number;
  /** Default task list for `kb qa run`. Default: ["build", "lint", "type-check", "test"]. */
  defaultTasks?: string[];
}
