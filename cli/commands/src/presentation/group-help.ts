import { type CommandGroup } from "./shared";
import { sideBorderBox, type SectionContent, safeColors, TimingTracker } from "@kb-labs/shared-cli-ui";

export function renderGroupHelp(group: CommandGroup): string {
  const tracker = new TimingTracker();

  const sortedCommands = [...group.commands].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const sections: SectionContent[] = [];

  // Summary section
  sections.push({
    items: [
      `${safeColors.bold('Description')}: ${group.describe}`,
      `${safeColors.bold('Commands')}: ${sortedCommands.length}`,
    ],
  });

  // Commands section
  // Convert command IDs to user-friendly format (replace all colons with spaces for display)
  const commandDisplayNames = sortedCommands.map((cmd) => {
    // Replace all colons with spaces for display (e.g., "agent:trace:stats" -> "agent trace stats")
    return cmd.name.replace(/:/g, ' ');
  });
  const maxNameLength = Math.max(...commandDisplayNames.map((name) => name.length));
  const commandItems: string[] = [];

  for (let i = 0; i < sortedCommands.length; i++) {
    const cmd = sortedCommands[i];
    const displayName = commandDisplayNames[i];
    if (!cmd || !displayName) {continue;}

    const paddedName = displayName.padEnd(maxNameLength);
    const description = cmd.describe || "No description";
    commandItems.push(`${safeColors.primary(paddedName)}  ${safeColors.muted(description)}`);

    if (cmd.examples && cmd.examples.length > 0) {
      for (const example of cmd.examples.slice(0, 2)) {
        commandItems.push(`  ${safeColors.muted(example)}`);
      }
    }
  }

  sections.push({
    header: 'Available commands',
    items: commandItems,
  });

  // Help section
  sections.push({
    header: 'Next Steps',
    items: [
      `kb ${group.name} <command> --help  ${safeColors.muted('Get help for a specific command')}`,
    ],
  });

  return sideBorderBox({
    title: `📦 ${group.name}`,
    sections,
    status: 'success',
    timing: tracker.total(),
  });
}

