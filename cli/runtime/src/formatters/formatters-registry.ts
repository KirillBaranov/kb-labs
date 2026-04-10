/**
 * @module @kb-labs/cli-runtime/formatters/formatters-registry
 * Output formatters registry
 */

export interface OutputFormatter {
  name: 'json' | 'yaml' | 'table' | 'markdown' | string;
  format(data: unknown): string;
}

export class FormattersRegistry {
  private formatters: Map<string, OutputFormatter> = new Map();

  register(formatter: OutputFormatter): void {
    this.formatters.set(formatter.name, formatter);
  }

  get(name: string): OutputFormatter | undefined {
    return this.formatters.get(name);
  }

  format(data: unknown, formatName: string): string {
    const formatter = this.formatters.get(formatName);
    if (!formatter) {
      throw new Error(`Formatter "${formatName}" not found`);
    }
    return formatter.format(data);
  }
}

