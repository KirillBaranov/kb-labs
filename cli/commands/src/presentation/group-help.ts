import { sideBorderBox, type SectionContent, safeColors, TimingTracker } from "@kb-labs/shared-cli-ui";
import type { RegisteredCommand } from "./shared";

export interface GroupHelpOptions {
  /** Full path of the group (e.g. ['marketplace', 'plugins']) */
  segments: string[];
  describe?: string;
  /** Direct child key names shown in group listing */
  childKeys: string[];
  /** Full plugin commands available under this path (for detailed listing) */
  commands?: RegisteredCommand[];
}

export function renderGroupHelp(opts: GroupHelpOptions): string {
  const tracker = new TimingTracker();
  const groupName = opts.segments.join(' ');
  const sections: SectionContent[] = [];

  if (opts.commands && opts.commands.length > 0) {
    // Detailed listing with descriptions
    const available = opts.commands.filter((c) => c.available && !c.shadowed);
    const unavailable = opts.commands.filter((c) => !c.available || c.shadowed);

    const maxLength = Math.max(
      ...opts.commands.map((c) => c.manifest.segments.join(' ').length),
      20,
    );

    if (available.length > 0) {
      const items = available
        .sort((a, b) => a.manifest.segments.join(' ').localeCompare(b.manifest.segments.join(' ')))
        .map((cmd) => {
          const displayPath = cmd.manifest.segments.join(' ');
          return `${safeColors.primary(displayPath.padEnd(maxLength))}  ${safeColors.muted(cmd.manifest.describe)}`;
        });
      sections.push({ header: 'Commands', items });
    }

    if (unavailable.length > 0) {
      const items = unavailable.map((cmd) => {
        const displayPath = cmd.manifest.segments.join(' ');
        let line = `${safeColors.muted(displayPath.padEnd(maxLength))}  ${safeColors.muted(cmd.manifest.describe)}`;
        if (cmd.unavailableReason) {
          line += `\n   ${safeColors.muted(`Reason: ${cmd.unavailableReason}`)}`;
        }
        return line;
      });
      sections.push({ header: 'Unavailable', items });
    }
  } else {
    // Compact listing — just child keys
    const sorted = [...opts.childKeys].sort();
    sections.push({
      header: 'Available',
      items: sorted.map((k) => safeColors.primary(`  ${k}`)),
    });
  }

  sections.push({
    items: [safeColors.muted(`kb ${groupName} <command> --help`)],
  });

  return sideBorderBox({
    title: groupName,
    sections,
    status: 'success',
    timing: tracker.total(),
  });
}
