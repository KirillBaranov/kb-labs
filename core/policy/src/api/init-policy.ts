/**
 * @module @kb-labs/core-policy/api/init-policy
 * Initialize policy scaffold in workspace config
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { InitResult } from "@kb-labs/core-config";

export interface InitPolicyOptions {
  cwd: string;
  bundleName?: string;
  scaffoldCommented?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

const POLICY_SCAFFOLD_YAML = `
# policy:
#   schemaVersion: "1.0"
#   bundle: default
#   overrides:
#     roles:
#       maintainer:
#         allow: ["release.publish","devkit.sync","devlink.watch","aiReview.run","profiles.materialize"]
#       developer:
#         allow: ["devlink.watch","aiReview.run"]
#         deny: []
#       guest:
#         allow: []
#         deny: ["release.publish"]
`;

/**
 * Find workspace config file
 */
async function findWorkspaceConfig(
  cwd: string,
): Promise<{ path: string; format: "yaml" | "json" } | null> {
  const filenames = [
    ".kb/kb.config.yaml",
    ".kb/kb.config.yml",
    ".kb/kb.config.json",
  ];

  for (const filename of filenames) {
    const candidate = path.join(cwd, filename);
    try {
      await fs.access(candidate);
      const format = filename.endsWith(".json") ? "json" : "yaml";
      return { path: candidate, format };
    } catch {
      // Try next filename
    }
  }

  return null;
}

/**
 * Initialize policy scaffold
 */
export async function initPolicy(opts: InitPolicyOptions): Promise<InitResult> {
  const cwd = path.resolve(opts.cwd);
  const result: InitResult = {
    actions: [],
    created: [],
    updated: [],
    skipped: [],
    warnings: [],
  };

  // Find workspace config
  const config = await findWorkspaceConfig(cwd);

  if (!config) {
    result.warnings.push(
      "No workspace config found, cannot add policy scaffold",
    );
    return result;
  }

  const { ensureWithinWorkspace } = await import("@kb-labs/core-config");
  ensureWithinWorkspace(config.path, cwd);

  if (config.format === "json") {
    // JSON doesn't support comments, skip scaffold
    result.actions.push({ kind: "skip", path: config.path });
    result.skipped.push(config.path);
    result.warnings.push(
      "ℹ policy scaffold skipped for JSON (no comments supported)",
    );
    return result;
  }

  // YAML format - append commented scaffold
  const content = await fs.readFile(config.path, "utf-8");

  // Check if policy block already exists
  if (/#\s*policy:/.test(content)) {
    result.actions.push({ kind: "skip", path: config.path });
    result.skipped.push(config.path);
    result.warnings.push("Policy scaffold already exists in config");
    return result;
  }

  // Append scaffold to end of file
  const newContent =
    content.trimEnd() + "\n" + POLICY_SCAFFOLD_YAML.trimEnd() + "\n";

  if (!opts.dryRun) {
    const { writeFileAtomic } = await import("@kb-labs/core-config");
    await writeFileAtomic(config.path, newContent);
  }

  result.actions.push({ kind: "append", path: config.path });
  result.updated.push(config.path);

  return result;
}
