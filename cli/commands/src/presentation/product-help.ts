import {
  colors,
  type RegisteredCommand,
} from "./shared";
import { sideBorderBox, type SectionContent } from "@kb-labs/shared-cli-ui";

// │  <prefix><paddedId>  <description>
// ^^^                                  = 3 chars (border + space)
//    ^^^^^^^^                          = prefix (2 chars)
//            ^^^^^^^^^^^^              = maxLength + 2-char gap
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
    if (cmd.available && !cmd.shadowed) {
      if (!availableMap.has(cmd.manifest.id)) {
        availableMap.set(cmd.manifest.id, cmd);
      }
    } else if (!unavailableMap.has(cmd.manifest.id)) {
      unavailableMap.set(cmd.manifest.id, cmd);
    }
  }

  // Keep manifest order so category sections appear in the order author defined them
  const available = Array.from(availableMap.values());
  const unavailable = Array.from(unavailableMap.values()).sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id),
  );

  const hasUnavailable = unavailable.length > 0;

  const maxLength = Math.max(
    ...[...available, ...unavailable].map((c) => c.manifest.id.replace(/:/g, ' ').length),
    20,
  );

  // Available commands — group by category if present, plain list otherwise
  const hasCategories = available.some((c) => c.manifest.category);
  const prefix = hasUnavailable ? `${colors.green("✓")} ` : "  ";

  if (hasCategories) {
    // Preserve manifest order within each category, collect categories in first-seen order
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
      const cmds = categoryMap.get(cat)!.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
      const items: string[] = cmds.map((cmd) => {
        const displayId = cmd.manifest.id.replace(/:/g, ' ');
        const paddedId = displayId.padEnd(maxLength);
        return `${prefix}${colors.cyan(paddedId)}  ${colors.dim(truncateDesc(cmd.manifest.describe, maxLength))}`;
      });
      sections.push({ header: cat || "Commands", items });
    }
  } else {
    const availableItems: string[] = [...available].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id)).map((cmd) => {
      const displayId = cmd.manifest.id.replace(/:/g, ' ');
      const paddedId = displayId.padEnd(maxLength);
      return `${prefix}${colors.cyan(paddedId)}  ${colors.dim(cmd.manifest.describe)}`;
    });
    sections.push({ header: "Commands", items: availableItems });
  }

  // Unavailable commands section (if any)
  if (hasUnavailable) {
    const unavailableItems: string[] = [];
    for (const cmd of unavailable) {
      const displayId = cmd.manifest.id.replace(/:/g, ' ');
      const paddedId = displayId.padEnd(maxLength);
      unavailableItems.push(`${colors.red("✗")} ${colors.dim(paddedId)}  ${colors.dim(cmd.manifest.describe)}`);
      if (cmd.unavailableReason) {
        unavailableItems.push(`   ${colors.red(`Reason: ${cmd.unavailableReason}`)}`);
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

  // Hint
  sections.push({
    items: [colors.dim(`kb ${groupName} <command> --help`)],
  });

  return sideBorderBox({
    title: groupName,
    sections,
    status: "info",
  });
}

