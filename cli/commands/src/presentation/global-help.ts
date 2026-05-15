import { colors } from "./shared";
import { sideBorderBox, type SectionContent, type RichSectionItem } from "@kb-labs/shared-cli-ui";
import type { TrieBackedRegistry } from "../registry/service";

export function renderGlobalHelp(registry: TrieBackedRegistry): string {
  const cols = (typeof process !== 'undefined' && process.stdout?.columns) || 80;
  const itemMaxWidth = Math.max(40, cols - 4);
  const sections: SectionContent[] = [];

  // System commands/groups (info, auth, docs, logs, ...)
  const systemEntries = registry.listSystemTopLevel().sort((a, b) => a.name.localeCompare(b.name));
  if (systemEntries.length > 0) {
    const maxLen = Math.max(...systemEntries.map((e) => e.name.length), 8);
    const items: Array<string | RichSectionItem> = systemEntries.map(({ name, describe }) => ({
      text: `${colors.cyan(name.padEnd(maxLen))}  ${colors.dim(describe)}`,
      truncate: itemMaxWidth,
    }));
    sections.push({ header: 'Commands', items });
  }

  // Plugin groups (first segment, unique)
  const allCommands = registry.listCommands();
  const topGroups = new Map<string, string | undefined>();
  for (const cmd of allCommands) {
    const group = cmd.manifest.group;
    if (!topGroups.has(group)) { topGroups.set(group, undefined); }
  }

  if (topGroups.size > 0) {
    const sorted = [...topGroups.keys()].sort();
    const maxLen = Math.max(...sorted.map((g) => g.length), 8);
    const items: Array<string | RichSectionItem> = sorted.map((name) => {
      const paddedName = colors.cyan(name.padEnd(maxLen));
      const desc = topGroups.get(name);
      if (!desc) { return paddedName; }
      return { text: `${paddedName}  ${colors.dim(desc)}`, truncate: itemMaxWidth };
    });
    sections.push({ header: 'Plugins', items });
  }

  sections.push({ items: [colors.dim('kb <command> --help')] });

  return sideBorderBox({ title: 'KB Labs CLI', sections, status: 'info' });
}

export function renderPluginsHelp(registry: TrieBackedRegistry): string {
  const commands = registry.listCommandsUnder(['marketplace']);

  const sections: SectionContent[] = [];

  if (commands.length > 0) {
    const maxLength = Math.max(...commands.map((c) => c.manifest.segments.join(' ').length), 20);
    const items = commands
      .filter((c) => c.available && !c.shadowed)
      .sort((a, b) => a.manifest.segments.join(' ').localeCompare(b.manifest.segments.join(' ')))
      .map((cmd) => {
        const displayPath = cmd.manifest.segments.join(' ');
        return `${colors.cyan(displayPath.padEnd(maxLength))}  ${colors.dim(cmd.manifest.describe)}`;
      });
    sections.push({ header: 'Plugin Management', items });
  }

  sections.push({
    items: [colors.dim("kb marketplace <command> --help")],
  });

  return sideBorderBox({ title: '🧩 Plugin Management', sections, status: 'info' });
}
