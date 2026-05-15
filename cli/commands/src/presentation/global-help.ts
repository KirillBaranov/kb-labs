import { colors } from "./shared";
import { sideBorderBox, type SectionContent } from "@kb-labs/shared-cli-ui";
import type { TrieBackedRegistry } from "../registry/service";

function truncate(s: string, max: number): string {
  if (s.length <= max) { return s; }
  return s.slice(0, max - 1) + '…';
}

export function renderGlobalHelp(registry: TrieBackedRegistry): string {
  const cols = (typeof process !== 'undefined' && process.stdout?.columns) || 80;
  const sections: SectionContent[] = [];

  // System commands (auth, completion, docs, info, logs, platform, registry)
  const systemEntries = registry.listSystemTopLevel().sort((a, b) => a.name.localeCompare(b.name));
  if (systemEntries.length > 0) {
    const nameLen = Math.max(...systemEntries.map((e) => e.name.length), 8);
    const items = systemEntries.map(({ name, describe }) =>
      `${colors.cyan(name.padEnd(nameLen))}  ${colors.dim(describe)}`
    );
    sections.push({ header: 'Commands', items });
  }

  // Plugin groups — unique first segments with describe from groupMeta
  const allCommands = registry.listCommands();
  const groupNames = [...new Set(allCommands.map((c) => c.manifest.group))].sort();

  if (groupNames.length > 0) {
    const nameLen = Math.max(...groupNames.map((g) => g.length), 8);

    const entries = groupNames.map((name) => ({
      name,
      describe: registry.getPluginGroupDescribe([name]) ?? '',
    }));

    // Use 2-column layout only if terminal is wide enough for readable descriptions
    const GAP = 4;
    const minDescLen = 24;
    const twoColMinWidth = (nameLen + 2 + minDescLen) * 2 + GAP + 4;
    const useTwoCols = cols >= twoColMinWidth;

    let items: string[];
    if (useTwoCols) {
      const descMax = Math.max(minDescLen, Math.floor((cols - 4 - (nameLen + 2) * 2 - GAP) / 2));
      const half = Math.ceil(entries.length / 2);
      const left  = entries.slice(0, half);
      const right = entries.slice(half);
      items = left.map((l, i) => {
        const r = right[i];
        const lName = colors.cyan(l.name.padEnd(nameLen));
        const lDesc = l.describe
          ? colors.dim(truncate(l.describe, descMax).padEnd(descMax))
          : ' '.repeat(descMax);
        if (!r) { return `${lName}  ${lDesc.trimEnd()}`; }
        const rName = colors.cyan(r.name.padEnd(nameLen));
        const rDesc = r.describe ? colors.dim(truncate(r.describe, descMax)) : '';
        return `${lName}  ${lDesc}  ${' '.repeat(GAP - 2)}${rName}  ${rDesc}`;
      });
    } else {
      const descMax = Math.max(24, cols - 4 - nameLen - 2);
      items = entries.map(({ name, describe }) => {
        const n = colors.cyan(name.padEnd(nameLen));
        return describe ? `${n}  ${colors.dim(truncate(describe, descMax))}` : n;
      });
    }

    sections.push({ header: 'Plugins', items });
  }

  sections.push({ items: [`kb ${colors.dim('<command> [subcommand] [flags]')}    ${colors.dim('·')}    ${colors.dim('kb <command> --help for details')}`] });

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
