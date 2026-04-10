/**
 * @module @kb-labs/cli-runtime/formatters/builtin/yaml
 * YAML formatter
 */

import { stringify } from 'yaml';
import type { OutputFormatter } from '../formatters-registry';

export const yamlFormatter: OutputFormatter = {
  name: 'yaml',
  format(data: unknown): string {
    return stringify(data);
  },
};

