/**
 * @module @kb-labs/cli-runtime/formatters/builtin/table
 * Table formatter
 */

import Table from 'cli-table3';
import type { OutputFormatter } from '../formatters-registry';

export const tableFormatter: OutputFormatter = {
  name: 'table',
  format(data: unknown): string {
    if (!data || typeof data !== 'object') {
      return JSON.stringify(data);
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {return '';}

      const firstItem = data[0];
      if (typeof firstItem !== 'object' || firstItem === null) {
        // Simple array
        const table = new Table();
        data.forEach((item, i) => table.push([i, item]));
        return table.toString();
      }

      // Array of objects
      const keys = Object.keys(firstItem);
      const table = new Table({ head: keys });
      data.forEach(item => {
        table.push(keys.map(k => (item as any)[k]));
      });
      return table.toString();
    }

    // Single object
    const table = new Table();
    Object.entries(data).forEach(([key, value]) => {
      table.push([key, String(value)]);
    });
    return table.toString();
  },
};

