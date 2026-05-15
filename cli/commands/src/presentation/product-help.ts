import {
  colors,
  type RegisteredCommand,
} from "./shared";
import { sideBorderBox, type SectionContent } from "@kb-labs/shared-cli-ui";

const BOX_OVERHEAD = 3;
const PREFIX_LEN = 2;
const GAP_LEN = 2;

function truncateDesc(desc: string, maxLength: number): string {
  const cols = (typeof process !== 'undefined' && process.stdout?.columns) || 80;
  const avail = cols - BOX_OVERHEAD - PREFIX_LEN - maxLength - GAP_LEN;
  if (avail < 10 || desc.length <= avail) {return desc;}
  return desc.slice(0, avail - 1) + '…';
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function renderProductHelp(
  groupName: string,
  commands: RegisteredCommand[],
): string {
  const sections: SectionContent[] = [];

  const availableMap = new Map<string, RegisteredCommand>();
  const unavailableMap = new Map<string, RegisteredCommand>();

  for (const cmd of commands) {
    const key = cmd.manifest.segments.join(' ');
    if (cmd.available && !cmd.shadowed) {
      if (!availableMap.has(key)) {
        availableMap.set(key, cmd);
      }
    } else if (!unavailableMap.has(key)) {
      unavailableMap.set(key, cmd);
    }
  }

  const available = Array.from(availableMap.values());
  const unavailable = Array.from(unavailableMap.values()).sort((a, b) =>
    a.manifest.segments.join(' ').localeCompare(b.manifest.segments.join(' '))
  );

  const hasUnavailable = unavailable.length > 0;

  const displayPath = (cmd: RegisteredCommand): string =>
    cmd.manifest.segments.join(' ');

  const maxLength = Math.max(
    ...[...available, ...unavailable].map((c) => displayPath(c).length),
    20,
  );

  const hasCategories = available.some((c) => c.manifest.category);
  const prefix = hasUnavailable ? `${colors.green("✓")} ` : "  ";

  if (hasCategories) {
    const categoryOrder: string[] = [];
    const categoryMap = new Map<string, RegisteredCommand[]>();
    for (const cmd of available) {
      const cat = cmd.manifest.category ?? "";
      if (!categoryMap.has(cat)) {
        categoryOrder.push(cat);
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(cmd);
    }

    for (const cat of categoryOrder) {
      const cmds = categoryMap
        .get(cat)!
        .sort((a, b) => displayPath(a).localeCompare(displayPath(b)));
      const items: string[] = cmds.map((cmd) => {
        const paddedPath = displayPath(cmd).padEnd(maxLength);
        return `${prefix}${colors.cyan(paddedPath)}  ${colors.dim(truncateDesc(cmd.manifest.describe, maxLength))}`;
      });
      sections.push({ header: cat || "Commands", items });
    }
  } else {
    const availableItems: string[] = [...available]
      .sort((a, b) => displayPath(a).localeCompare(displayPath(b)))
      .map((cmd) => {
        const paddedPath = displayPath(cmd).padEnd(maxLength);
        return `${prefix}${colors.cyan(paddedPath)}  ${colors.dim(cmd.manifest.describe)}`;
      });
    sections.push({ header: "Commands", items: availableItems });
  }

  if (hasUnavailable) {
    const unavailableItems: string[] = [];
    for (const cmd of unavailable) {
      const paddedPath = displayPath(cmd).padEnd(maxLength);
      unavailableItems.push(`${colors.red("✗")} ${colors.dim(paddedPath)}  ${colors.dim(cmd.manifest.describe)}`);
      if (cmd.unavailableReason) {
        unavailableItems.push(`   ${colors.red(`Reason: ${cmd.unavailableReason}`)}`);
      }
      if (cmd.hint) {
        unavailableItems.push(`   ${colors.yellow(`Hint: ${cmd.hint}`)}`);
      }
    }
    sections.push({ header: "Unavailable", items: unavailableItems });
  }

  sections.push({
    items: [colors.dim(`kb ${groupName} <command> --help`)],
  });

  return sideBorderBox({
    title: groupName,
    sections,
    status: "info",
  });
}
