/**
 * docs:generate-cli-reference command - Generate CLI reference documentation
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import type { SectionContent } from '@kb-labs/shared-cli-ui';
import { generateExamples } from '../../utils/generate-examples';
import { registry } from '../../registry/service';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type GenerateCliReferenceFlags = {
  output: { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
};

type DocsGenerateResult = CommandResult & {
  message: string;
  sections: SectionContent[];
  json: { output: string; commands: number; groups: number; size: number };
};

export const docsGenerateCliReference = defineSystemCommand<GenerateCliReferenceFlags, DocsGenerateResult>({
  name: 'generate-cli-reference',
  description: 'Generate CLI reference documentation from command registry',
  category: 'docs',
  examples: generateExamples('generate-cli-reference', 'docs', [
    { flags: {} },
    { flags: { output: './docs/CLI-REFERENCE.md' } },
  ]),
  flags: {
    output: { type: 'string', description: 'Output file path (default: CLI-REFERENCE.md)' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'docs:generate-cli-reference',
    startEvent: 'DOCS_GENERATE_CLI_REFERENCE_STARTED',
    finishEvent: 'DOCS_GENERATE_CLI_REFERENCE_FINISHED',
  },
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Complex markdown generation with nested loops for product groups, commands, and formatting
  async handler(ctx, argv, flags) {
    const cwd = getContextCwd(ctx);
    const outputPath = flags.output || path.join(cwd, 'CLI-REFERENCE.md');


    // Get all commands from registry
    const commands = registry.list();
    const productGroups = registry.listProductGroups();

    ctx.platform?.logger?.info('Generating CLI reference', {
      commands: commands.length,
      products: productGroups.length,
      output: outputPath,
    });

    // Group commands by category/group
    const groups = new Map<string, typeof commands>();
    for (const cmd of commands) {
      const group = cmd.category || 'other';
      if (!groups.has(group)) {
        groups.set(group, []);
      }
      groups.get(group)!.push(cmd);
    }


    // Generate markdown
    const lines: string[] = [];
    lines.push('# KB Labs CLI Reference\n');
    lines.push(`Generated: ${new Date().toISOString()}\n`);
    lines.push(`Total Commands: ${commands.length}\n`);
    lines.push('---\n');

    // Table of contents
    lines.push('## Table of Contents\n');
    const sortedGroups = Array.from(groups.keys()).sort();
    for (const groupName of sortedGroups) {
      const cmds = groups.get(groupName)!;
      lines.push(`- [${groupName}](#${groupName.toLowerCase()}) (${cmds.length} commands)`);
    }
    lines.push('\n---\n');

    // Generate sections for each group
    for (const groupName of sortedGroups) {
      const cmds = groups.get(groupName)!.sort((a, b) => a.name.localeCompare(b.name));

      lines.push(`## ${groupName}\n`);

      for (const cmd of cmds) {
        lines.push(`### \`kb ${cmd.name}\`\n`);
        lines.push(`${cmd.describe || 'No description'}\n`);

        if (cmd.longDescription) {
          lines.push(`${cmd.longDescription}\n`);
        }

        if (cmd.flags && cmd.flags.length > 0) {
          lines.push('**Flags:**\n');
          for (const flag of cmd.flags) {
            const alias = flag.alias ? ` (-${flag.alias})` : '';
            const required = flag.required ? ' **(required)**' : '';
            const defaultVal = flag.default !== undefined ? ` (default: \`${flag.default}\`)` : '';
            const choices = flag.choices ? ` (choices: ${flag.choices.map(c => `\`${c}\``).join(', ')})` : '';
            lines.push(`- \`--${flag.name}\`${alias}: ${flag.description || 'No description'}${required}${defaultVal}${choices}`);
          }
          lines.push('');
        }

        if (cmd.examples && cmd.examples.length > 0) {
          lines.push('**Examples:**\n');
          lines.push('```bash');
          for (const example of cmd.examples) {
            lines.push(example);
          }
          lines.push('```\n');
        }

        if (cmd.aliases && cmd.aliases.length > 0) {
          lines.push(`**Aliases:** ${cmd.aliases.map(a => `\`${a}\``).join(', ')}\n`);
        }

        lines.push('---\n');
      }
    }


    // Write to file
    const content = lines.join('\n');
    await fs.writeFile(outputPath, content, 'utf-8');

    ctx.platform?.logger?.info('CLI reference generated', {
      path: outputPath,
      size: content.length,
    });

    const message = `CLI reference generated: ${outputPath}`;
    const sections = [
      {
        header: 'Summary',
        items: [
          `Commands: ${commands.length}`,
          `Groups: ${groups.size}`,
          `Output: ${outputPath}`,
          `Size: ${(content.length / 1024).toFixed(2)} KB`,
        ],
      },
      {
        header: 'Next Steps',
        items: [
          `cat ${outputPath}`,
          'git add CLI-REFERENCE.md',
          'git commit -m "docs: update CLI reference"',
        ],
      },
    ];

    return {
      ok: true,
      status: 'success',
      message,
      sections,
      json: {
        output: outputPath,
        commands: commands.length,
        groups: groups.size,
        size: content.length,
      },
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      console.log(JSON.stringify(result.json, null, 2));
    } else {
      ctx.ui.success('CLI Reference Generator', { sections: result.sections });
    }
  },
});
