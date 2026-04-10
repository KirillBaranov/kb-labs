import { box } from '../../format';
import { formatDebugEntryAI, formatDebugEntriesAI, shouldUseAIFormat } from '../formatters/ai';
import {
  formatDebugEntryHuman,
  formatDebugEntriesHuman,
  type HumanFormatterOptions,
} from '../formatters/human';
import { formatTimelineWithSummary } from '../formatters/timeline';
import type { DebugDetailLevel, DebugEntry, DebugFormat } from '../types';

export interface DebugOutputOptions extends HumanFormatterOptions {
  format?: DebugFormat;
  detailLevel?: DebugDetailLevel;
  useTimeline?: boolean;
}

export function formatDebugOutput(entry: DebugEntry, options: DebugOutputOptions = {}): string {
  if (shouldUseAIFormat(options.format)) {
    return formatDebugEntryAI(entry);
  }

  return formatDebugEntryHuman(entry, options);
}

export function formatDebugOutputs(entries: DebugEntry[], options: DebugOutputOptions = {}): string {
  if (shouldUseAIFormat(options.format)) {
    return formatDebugEntriesAI(entries);
  }

  if (options.useTimeline) {
    return formatTimelineWithSummary(entries);
  }

  return formatDebugEntriesHuman(entries, options);
}

export class DebugSection {
  private readonly entries: DebugEntry[] = [];
  private readonly title: string;
  private readonly options: DebugOutputOptions;

  constructor(title: string, options: DebugOutputOptions = {}) {
    this.title = title;
    this.options = options;
  }

  add(entry: DebugEntry): void {
    this.entries.push(entry);
  }

  addAll(entries: DebugEntry[]): void {
    this.entries.push(...entries);
  }

  clear(): void {
    this.entries.length = 0;
  }

  format(): string {
    if (this.entries.length === 0) {
      return '';
    }

    const content = formatDebugOutputs(this.entries, this.options);
    if (!content) {
      return '';
    }

    if (shouldUseAIFormat(this.options.format)) {
      return content;
    }

    return box(this.title, content.split('\n'));
  }

  get count(): number {
    return this.entries.length;
  }
}

export class DebugOutput {
  private readonly sections = new Map<string, DebugSection>();
  private readonly globalEntries: DebugEntry[] = [];
  private readonly options: DebugOutputOptions;

  constructor(options: DebugOutputOptions = {}) {
    this.options = options;
  }

  add(entry: DebugEntry): void {
    this.globalEntries.push(entry);
  }

  addToSection(sectionName: string, entry: DebugEntry): void {
    if (!this.sections.has(sectionName)) {
      this.sections.set(sectionName, new DebugSection(sectionName, this.options));
    }
    this.sections.get(sectionName)!.add(entry);
  }

  getSection(sectionName: string): DebugSection {
    if (!this.sections.has(sectionName)) {
      this.sections.set(sectionName, new DebugSection(sectionName, this.options));
    }
    return this.sections.get(sectionName)!;
  }

  format(): string {
    const parts: string[] = [];

    if (this.globalEntries.length > 0) {
      const formatted = formatDebugOutputs(this.globalEntries, this.options);
      if (formatted) {
        parts.push(formatted);
      }
    }

    for (const [, section] of this.sections) {
      const formatted = section.format();
      if (formatted) {
        parts.push(formatted);
      }
    }

    return parts.join('\n\n');
  }

  clear(): void {
    this.globalEntries.length = 0;
    this.sections.clear();
  }

  get totalCount(): number {
    let count = this.globalEntries.length;
    for (const section of this.sections.values()) {
      count += section.count;
    }
    return count;
  }
}

