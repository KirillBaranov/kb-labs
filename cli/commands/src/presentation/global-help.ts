import {
  colors,
  TimingTracker,
  type Command,
  type CommandGroup,
  type ProductGroup,
} from "./shared";
import { sideBorderBox, type SectionContent } from "@kb-labs/shared-cli-ui";

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
  const systemGroups = registry.listGroups?.() || [];

  // Get all command names and aliases from groups to exclude them from standalone
  const commandsInGroups = new Set<string>();
  for (const group of systemGroups) {
    for (const cmd of group.commands) {
      commandsInGroups.add(cmd.name);
      // Also add all aliases
      for (const alias of cmd.aliases || []) {
        commandsInGroups.add(alias);
      }
    }
  }

  // Filter standalone commands - exclude commands that are already in groups
  const standalone = registry
    .list()
    .filter((cmd: Command) => {
      // Exclude commands that are in groups
      if (commandsInGroups.has(cmd.name)) {
        return false;
      }
      // Keep only system commands without category or with category === "system"
      return (!cmd.category || cmd.category === "system");
    });

  const sections: SectionContent[] = [];

  // Products section - simplified format: name (count)
  if (products.length > 0) {
    const maxProductNameLength = Math.max(
      ...products.map((p) => p.name.length),
      12,
    );

    const productItems = products
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((product) => {
        const availableCount = product.commands.filter(
          (c) => c.available && !c.shadowed,
        ).length;
        const badge = colors.green(`(${availableCount})`);

        return `${colors.cyan(
          product.name.padEnd(maxProductNameLength),
        )}  ${badge}`;
      });

    sections.push({
      header: "Products",
      items: productItems,
    });
  }

  // System Commands section - compact format: group name (count)
  if (systemGroups.length > 0) {
    const maxGroupNameLength = Math.max(
      ...systemGroups.map((g) => g.name.length),
      20,
    );

    const groupItems = systemGroups
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((group) => {
        const commandCount = group.commands.length;
        const badge = colors.green(`(${commandCount})`);

        return `${colors.cyan(group.name.padEnd(maxGroupNameLength))}  ${badge}`;
      });

    sections.push({
      header: "System Commands",
      items: groupItems,
    });
  }

  // Other Commands section - only show if there are standalone commands
  if (standalone.length > 0) {
    const maxCommandNameLength = Math.max(
      ...standalone.map((c) => c.name.length),
      12,
    );

    const standaloneItems = standalone
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((cmd) =>
        `${colors.cyan(cmd.name.padEnd(maxCommandNameLength))}  ${colors.dim(
          cmd.describe,
        )}`
      );

    sections.push({
      header: "Other Commands",
      items: standaloneItems,
    });
  }

  // Global Options section
  const globalOptions = [
    { name: "--help", desc: "Show help information" },
    { name: "--version", desc: "Show CLI version" },
    { name: "--json", desc: "Output in JSON format" },
    { name: "--quiet", desc: "Suppress detailed output" },
  ];

  const maxOptionNameLength = Math.max(
    ...globalOptions.map((o) => o.name.length),
    12,
  );

  const optionItems = globalOptions.map((option) =>
    `${colors.cyan(option.name.padEnd(maxOptionNameLength))}  ${colors.dim(
      option.desc,
    )}`
  );

  sections.push({
    header: "Global Options",
    items: optionItems,
  });

  // Next Steps section
  const nextStepsItems: string[] = [];

  const firstProduct = products[0];
  if (firstProduct) {
    nextStepsItems.push(
      `${colors.cyan(
        `kb ${firstProduct.name} --help`,
      )}  ${colors.dim("Explore product commands")}`,
    );
  }

  const marketplaceGroup = systemGroups.find((g: CommandGroup) => g.name === "marketplace");
  if (marketplaceGroup) {
    nextStepsItems.push(
      `${colors.cyan("kb marketplace")}  ${colors.dim("Open marketplace commands")}`,
    );
  }

  nextStepsItems.push("");
  nextStepsItems.push(
    colors.dim("Use 'kb <product> --help' or 'kb <group> --help' to see commands for a specific product or group."),
  );

  sections.push({
    header: "Next Steps",
    items: nextStepsItems,
  });

  return sideBorderBox({
    title: "KB Labs CLI",
    sections,
    status: "info",
  });
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
