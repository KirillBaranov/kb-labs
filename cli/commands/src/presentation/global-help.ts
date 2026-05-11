import {
  colors,
  TimingTracker,
  type Command,
  type CommandGroup,
  type ProductGroup,
} from "./shared";
import { sideBorderBox, type SectionContent, type RichSectionItem } from "@kb-labs/shared-cli-ui";

export function renderGlobalHelp(
  groups: ProductGroup[],
  standalone: Command[],
): string {
  const lines: string[] = [];

  lines.push(
    colors.cyan(colors.bold("KB Labs CLI")) +
      " - Project management and automation tool",
  );
  lines.push("");
  lines.push(colors.bold("Usage:") + " kb [command] [options]");
  lines.push("");

  if (groups.length > 0) {
    lines.push(colors.bold("Product Commands:"));
    lines.push("");

    for (const group of groups.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(
        `  ${colors.cyan(group.name.padEnd(12))}  ${colors.dim(
          group.describe ?? "",
        )}`,
      );
    }
    lines.push("");
  }

  if (standalone.length > 0) {
    lines.push(colors.bold("System Commands:"));
    lines.push("");

    for (const cmd of standalone.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(
        `  ${colors.cyan(cmd.name.padEnd(12))}  ${colors.dim(cmd.describe)}`,
      );
    }
    lines.push("");
  }

  lines.push(colors.bold("Global Options:"));
  lines.push("");
  lines.push(
    `  ${colors.cyan("--help".padEnd(12))}  ${colors.dim("Show help information")}`,
  );
  lines.push(
    `  ${colors.cyan("--version".padEnd(12))}  ${colors.dim("Show CLI version")}`,
  );
  lines.push(
    `  ${colors.cyan("--json".padEnd(12))}  ${colors.dim("Output in JSON format")}`,
  );
  lines.push(
    `  ${colors.cyan("--quiet".padEnd(12))}  ${colors.dim("Suppress detailed output")}`,
  );
  lines.push("");
  lines.push(
    colors.dim(
      "Use 'kb <group> --help' to see commands for a specific product.",
    ),
  );

  return lines.join("\n");
}

export function renderGlobalHelpNew(registry: {
  listProductGroups(): ProductGroup[];
  list(): Command[];
  listGroups?(): CommandGroup[];
}): string {
  const products = registry.listProductGroups();
  // Filter out sub-groups (names with spaces, e.g. "marketplace plugins")
  const systemGroups = (registry.listGroups?.() ?? []).filter(g => !g.name.includes(' '));

  const cols = (typeof process !== 'undefined' && process.stdout?.columns) || 80;
  // sideBorderBox wraps/truncates at this width (same formula used internally)
  const itemMaxWidth = Math.max(40, cols - 4);
  const sections: SectionContent[] = [];

  // Plugins section — name + description, truncated to fit terminal width
  if (products.length > 0) {
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name));
    const maxLen = Math.max(...sorted.map(p => p.name.length), 8);

    const items: Array<string | RichSectionItem> = sorted.map(product => {
      const paddedName = colors.cyan(product.name.padEnd(maxLen));
      if (!product.describe) {return paddedName;}
      return { text: `${paddedName}  ${colors.dim(product.describe)}`, truncate: itemMaxWidth };
    });

    sections.push({ header: 'Plugins', items });
  }

  // System section — compact single row of names
  if (systemGroups.length > 0) {
    const sorted = [...systemGroups].sort((a, b) => a.name.localeCompare(b.name));
    const line = sorted.map(g => colors.cyan(g.name)).join('   ');
    sections.push({ header: 'System', items: [line] });
  }

  // Single hint line
  sections.push({ items: [colors.dim('kb <plugin> --help')] });

  return sideBorderBox({ title: 'KB Labs CLI', sections, status: 'info' });
}

export function renderPluginsHelp(registry: {
  list(): Command[];
}): string {
  const tracker = new TimingTracker();

  const _pluginCommands = registry
    .list()
    .filter(
      (cmd) =>
        cmd.name?.startsWith("marketplace:") || cmd.category === "system",
    );

  const sections: SectionContent[] = [];

  // Plugin Management Commands section
  const commandMap: Record<string, string> = {
    "marketplace:install": "Install package(s) from marketplace",
    "marketplace:update": "Update package(s) from marketplace",
    "marketplace:list": "List all discovered plugins",
    "marketplace:enable": "Enable a plugin",
    "marketplace:disable": "Disable a plugin",
    "marketplace:link": "Link a local plugin for development",
    "marketplace:unlink": "Unlink a local plugin",
    "marketplace:doctor": "Diagnose plugin issues",
    "marketplace:scaffold": "Generate a new plugin template",
    "marketplace:clear-cache": "Clear plugin discovery cache",
  };

  const maxLength = Math.max(
    ...Object.keys(commandMap).map((c) => c.length),
    20,
  );

  const commandItems = Object.entries(commandMap).map(([cmdName, desc]) =>
    `${colors.cyan(cmdName.padEnd(maxLength))}  ${colors.dim(desc)}`
  );

  sections.push({
    header: "Plugin Management Commands",
    items: commandItems,
  });

  // Examples section
  const examples = [
    `kb marketplace list                    ${colors.dim("List all plugins")}`,
    `kb marketplace enable @kb-labs/devlink-cli  ${colors.dim("Enable a plugin")}`,
    `kb marketplace doctor                 ${colors.dim("Diagnose plugin issues")}`,
    `kb marketplace scaffold my-plugin      ${colors.dim("Generate plugin template")}`,
  ];

  sections.push({
    header: "Examples",
    items: examples.map(ex => colors.dim(ex)),
  });

  // Next steps
  sections.push({
    header: "Next Steps",
    items: [colors.dim("Use 'kb marketplace <command> --help' for detailed help")],
  });

  return sideBorderBox({
    title: "🧩 Plugin Management",
    sections,
    status: "info",
    timing: tracker.total(),
  });
}
