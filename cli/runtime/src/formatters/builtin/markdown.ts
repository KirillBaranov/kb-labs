import type { OutputFormatter } from '../formatters-registry';

export const markdownFormatter: OutputFormatter = {
  name: 'markdown',
  format(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }
    // Simple markdown formatting - convert object to markdown table
    return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  },
};
