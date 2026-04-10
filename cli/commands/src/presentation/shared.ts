import { colors } from "@kb-labs/cli-runtime";
import { box, formatTiming, TimingTracker } from "@kb-labs/shared-cli-ui";

import type { Command, CommandGroup } from "../registry/legacy-types";
import type { RegisteredCommand } from "../registry/types";
import type { ProductGroup } from "../registry/service";

export {
  colors,
  box,
  formatTiming,
  TimingTracker,
};

export type { Command, CommandGroup, RegisteredCommand, ProductGroup };

export function collectManifestVersions(
  commands: RegisteredCommand[],
): string[] {
  const versions = new Set<string>();

  for (const cmd of commands) {
    const schema = cmd.manifest.manifestV2?.schema;
    if (typeof schema === "string") {
      const tail = schema.split("/").pop() ?? schema;
      const match = tail.match(/\d+/);
      versions.add(match ? `v${match[0]}` : tail);
    } else {
      versions.add("v2");
    }
  }

  return Array.from(versions).sort();
}

