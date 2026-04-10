/**
 * Git submodule metadata for a repo within the monorepo.
 */
export interface SubmoduleInfo {
  /** Directory name (e.g. "kb-labs-mind") */
  name: string;
  /** Short commit hash */
  commit: string;
  /** Current branch */
  branch: string;
  /** Whether the submodule has uncommitted changes */
  dirty: boolean;
  /** Last commit message */
  message: string;
}
