import {
  colors,
  type RegisteredCommand,
} from "./shared";

interface RenderHelpOptions {
  json: boolean;
  onlyAvailable: boolean;
  version?: string;
}

export function renderHelp(
  commands: RegisteredCommand[],
  options: RenderHelpOptions,
): string | Record<string, unknown> {
  const grouped = groupCommands(commands, options.onlyAvailable);

  if (options.json) {
    return {
      version: options.version ?? "1.0.0",
      generatedAt: new Date().toISOString(),
      groups: grouped.map((group) => ({
        name: group.name,
        describe: group.describe,
        commands: group.commands.map((cmd) => ({
          id: cmd.manifest.id,
          describe: cmd.manifest.describe,
          group: cmd.manifest.group,
          aliases: cmd.manifest.aliases ?? [],
          available: cmd.available && !cmd.shadowed,
          source: cmd.source,
          shadowed: cmd.shadowed ?? false,
          reason: cmd.unavailableReason,
          hint: cmd.hint,
        })),
      })),
    };
  }

  const lines: string[] = [];
  lines.push(colors.bold("KB Labs CLI"));
  lines.push("");

  for (const group of grouped) {
    lines.push(colors.bold(group.name));
    for (const cmd of group.commands) {
      // Convert command ID to user-friendly format (replace : with space for display)
      const displayId = cmd.manifest.id.replace(/:/g, ' ');
      lines.push(
        `  ${colors.cyan(displayId)}  ${colors.dim(
          cmd.manifest.describe ?? "",
        )}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function groupCommands(
  commands: RegisteredCommand[],
  onlyAvailable: boolean,
) {
  const groups = new Map<
    string,
    { name: string; describe?: string; commands: RegisteredCommand[] }
  >();

  for (const cmd of commands) {
    const shouldInclude =
      !onlyAvailable || (cmd.available && !cmd.shadowed);
    if (!shouldInclude) {
      continue;
    }

    const groupName = cmd.manifest.group ?? "system";
    if (!groups.has(groupName)) {
      groups.set(groupName, {
        name: groupName,
        describe: cmd.manifest.group,
        commands: [],
      });
    }
    groups.get(groupName)!.commands.push(cmd);
  }

  for (const group of groups.values()) {
    group.commands.sort((a, b) =>
      a.manifest.id.localeCompare(b.manifest.id),
    );
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

