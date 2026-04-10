import {
  colors,
  collectManifestVersions,
  TimingTracker,
  type RegisteredCommand,
} from "./shared";
import { sideBorderBox, type SectionContent } from "@kb-labs/shared-cli-ui";

export function renderProductHelp(
  groupName: string,
  commands: RegisteredCommand[],
): string {
  const tracker = new TimingTracker();
  const sections: SectionContent[] = [];

  const manifestVersions = collectManifestVersions(commands);
  if (manifestVersions.length > 0) {
    sections.push({
      header: "Manifest",
      items: [colors.cyan(manifestVersions.join(" + "))],
    });
  }

  const availableMap = new Map<string, RegisteredCommand>();
  const unavailableMap = new Map<string, RegisteredCommand>();

  for (const cmd of commands) {
    if (cmd.available && !cmd.shadowed) {
      if (!availableMap.has(cmd.manifest.id)) {
        availableMap.set(cmd.manifest.id, cmd);
      }
    } else if (!unavailableMap.has(cmd.manifest.id)) {
      unavailableMap.set(cmd.manifest.id, cmd);
    }
  }

  const available = Array.from(availableMap.values()).sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id),
  );
  const unavailable = Array.from(unavailableMap.values()).sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id),
  );

  // Calculate max length based on display format (with spaces instead of colons)
  const maxLength = Math.max(
    ...[...available, ...unavailable].map((c) => c.manifest.id.replace(/:/g, ' ').length),
    20,
  );

  // Available commands section
  const availableItems: string[] = [];
  for (const cmd of available) {
    const status = colors.green("✓");
    // Convert command ID to user-friendly format (replace : with space for display)
    const displayId = cmd.manifest.id.replace(/:/g, ' ');
    const paddedId = displayId.padEnd(maxLength);
    availableItems.push(
      `${status} ${colors.cyan(paddedId)}  ${colors.dim(
        cmd.manifest.describe,
      )}`,
    );

    if (cmd.manifest.examples && cmd.manifest.examples.length > 0) {
      for (const example of cmd.manifest.examples.slice(0, 2) as string[]) {
        availableItems.push(`   ${colors.dim(example)}`);
      }
    }
  }

  sections.push({
    header: "Available Commands",
    items: availableItems,
  });

  // Unavailable commands section (if any)
  if (unavailable.length > 0) {
    const unavailableItems: string[] = [];
    for (const cmd of unavailable) {
      const status = colors.red("✗");
      // Convert command ID to user-friendly format (replace : with space for display)
      const displayId = cmd.manifest.id.replace(/:/g, ' ');
      const paddedId = displayId.padEnd(maxLength);
      unavailableItems.push(
        `${status} ${colors.dim(paddedId)}  ${colors.dim(
          cmd.manifest.describe,
        )}`,
      );

      if (cmd.unavailableReason) {
        unavailableItems.push(
          `   ${colors.red(`Reason: ${cmd.unavailableReason}`)}`,
        );
      }
      if (cmd.hint) {
        unavailableItems.push(`   ${colors.yellow(`Hint: ${cmd.hint}`)}`);
      }
    }

    sections.push({
      header: "Unavailable",
      items: unavailableItems,
    });
  }

  // Next Steps section
  const uniqueCommands = new Map<string, RegisteredCommand>();
  for (const cmd of available) {
    if (!uniqueCommands.has(cmd.manifest.id)) {
      uniqueCommands.set(cmd.manifest.id, cmd);
    }
  }

  const nextStepsItems = Array.from(uniqueCommands.values())
    .slice(0, 3)
    .map((cmd) => {
      // Convert command ID to user-friendly format (replace : with space for display)
      const displayId = cmd.manifest.id.replace(/:/g, ' ');
      return `${colors.cyan(`kb ${displayId}`)}  ${colors.dim(
        cmd.manifest.describe,
      )}`;
    });

  if (nextStepsItems.length === 0) {
    nextStepsItems.push(colors.dim("No available commands in this product"));
  } else {
    nextStepsItems.push("");
    nextStepsItems.push(
      colors.dim(
        `Use 'kb ${groupName} <command> --help' for detailed help`,
      ),
    );
  }

  nextStepsItems.push("");
  nextStepsItems.push(
    colors.dim("Use 'kb --help' to see all products and system commands."),
  );

  sections.push({
    header: "Next Steps",
    items: nextStepsItems,
  });

  return sideBorderBox({
    title: groupName,
    sections,
    status: "info",
    timing: tracker.total(),
  });
}

