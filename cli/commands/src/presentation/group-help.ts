import { type CommandGroup } from "./shared";
import { sideBorderBox, type SectionContent, safeColors, TimingTracker } from "@kb-labs/shared-cli-ui";

export function renderGroupHelp(group: CommandGroup): string {
  const tracker = new TimingTracker();

  const sortedCommands = [...group.commands].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const sections: SectionContent[] = [];

  // Commands section
  const commandDisplayNames = sortedCommands.map((cmd) =>
    cmd.name.replace(/:/g, ' '),
  );
  const maxNameLength = Math.max(...commandDisplayNames.map((name) => name.length));
  const commandItems: string[] = [];

  for (let i = 0; i < sortedCommands.length; i++) {
    const cmd = sortedCommands[i];
    const displayName = commandDisplayNames[i];
    if (!cmd || !displayName) {continue;}

    const paddedName = displayName.padEnd(maxNameLength);
    const description = cmd.describe || "No description";
    commandItems.push(`${safeColors.primary(paddedName)}  ${safeColors.muted(description)}`);
  }

  sections.push({
    header: 'Available commands',
    items: commandItems,
  });

  // Help section
  sections.push({
    header: 'Next Steps',
    items: [
      safeColors.muted(`kb ${group.name} <command> --help`),
    ],
  });

  return sideBorderBox({
    title: `📦 ${group.name}`,
    sections,
    status: 'success',
    timing: tracker.total(),
  });
}

