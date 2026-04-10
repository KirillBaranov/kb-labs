import {
  TimingTracker,
  type RegisteredCommand,
} from "./shared";
import { formatCommandHelp } from "@kb-labs/shared-cli-ui";

export function renderManifestCommandHelp(
  registered: RegisteredCommand,
): string {
  const _tracker = new TimingTracker();
  const manifest = registered.manifest;

  // Map manifest flags to formatCommandHelp format
  const flags = manifest.flags?.map(flag => ({
    name: flag.name,
    alias: flag.alias,
    description: flag.describe ?? flag.description,
    required: flag.required,
  }));

  // Use new modern formatCommandHelp utility
  return formatCommandHelp({
    title: manifest.id,
    description: manifest.describe,
    longDescription: manifest.longDescription,
    examples: manifest.examples,
    flags,
    aliases: manifest.aliases,
  });
}

