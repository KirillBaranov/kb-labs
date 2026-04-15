import {
  intro as clackIntro,
  outro as clackOutro,
  text,
  confirm,
  select,
  multiselect,
  isCancel,
  cancel,
  log,
} from '@clack/prompts';
import type { Variable } from '@kb-labs/scaffold-contracts';
import { runValidator } from '@kb-labs/scaffold-core';

export function intro(msg: string): void {
  clackIntro(msg);
}
export function outro(msg: string): void {
  clackOutro(msg);
}

export function info(msg: string): void {
  log.info(msg);
}
export function warn(msg: string): void {
  log.warn(msg);
}
export function error(msg: string): void {
  log.error(msg);
}

function abortOnCancel<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Aborted.');
    process.exit(130);
  }
  return value as T;
}

export async function askVariable(
  variable: Variable,
  defaults: Record<string, unknown>,
): Promise<unknown> {
  const preset = defaults[variable.name] ?? variable.default;

  switch (variable.type) {
    case 'boolean': {
      const result = await confirm({
        message: variable.describe,
        initialValue: typeof preset === 'boolean' ? preset : false,
      });
      return abortOnCancel(result);
    }
    case 'select': {
      if (!variable.choices || variable.choices.length === 0) {
        throw new Error(`Variable "${variable.name}" is select but has no choices`);
      }
      const result = await select({
        message: variable.describe,
        options: variable.choices.map((c) => ({ value: c.value, label: c.label })),
        initialValue: (preset as string) ?? variable.choices[0]?.value,
      });
      return abortOnCancel(result);
    }
    case 'multiselect': {
      if (!variable.choices || variable.choices.length === 0) {
        throw new Error(`Variable "${variable.name}" is multiselect but has no choices`);
      }
      const result = await multiselect({
        message: variable.describe,
        options: variable.choices.map((c) => ({ value: c.value, label: c.label })),
        initialValues: Array.isArray(preset) ? (preset as string[]) : [],
        required: false,
      });
      return abortOnCancel(result);
    }
    case 'string':
    default: {
      const result = await text({
        message: variable.describe,
        initialValue: typeof preset === 'string' ? preset : '',
        validate: variable.validate
          ? (value: string) => runValidator(variable.validate!, value) ?? undefined
          : undefined,
      });
      return abortOnCancel(result);
    }
  }
}

export async function askBlocks(
  options: { value: string; label: string; hint?: string }[],
  initialValues: string[],
): Promise<string[]> {
  const result = await multiselect({
    message: 'Pick blocks to include',
    options,
    initialValues,
    required: true,
  });
  return abortOnCancel(result) as string[];
}

export async function confirmOverwrite(path: string): Promise<boolean> {
  const result = await confirm({
    message: `Target "${path}" is not empty. Overwrite?`,
    initialValue: false,
  });
  return abortOnCancel(result);
}
