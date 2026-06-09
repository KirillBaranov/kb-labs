У меня достаточно данных. Вот детальный план реализации:

---

## Summary

Добавить команду `kb workflow runs cancel <runId>`, которая вызывает уже существующий метод `WorkflowDaemonClient.cancelRun()` и печатает подтверждение. Нужно создать файл команды, зарегистрировать её в манифесте, добавить определение флагов и написать тесты.

## Root cause / context

Daemon уже поддерживает `POST /api/v1/runs/{runId}/cancel` и HTTP-клиент имеет `cancelRun(runId)` (строки 381–390 `http-client.ts`). `defaultWorkflowClient` в тестовых хелперах уже включает `cancelRun: async () => {}` (строка 43 `defaults.ts`). Единственное, чего не хватает — CLI-команда и её регистрация в манифесте. Паттерн полностью аналогичен `runs-rerun`.

## Implementation steps

**1. Добавить флаги в `plugins/workflow/entry/src/flags.ts`**

После блока `runsRerunFlags` (строка ~267) добавить:
```typescript
export const runsCancelFlags = {
  'run-id': {
    type: 'string',
    description: 'Run ID to cancel (alias for positional argument)',
  },
  json: {
    type: 'boolean',
    description: OUTPUT_JSON_DESCRIPTION,
    default: false,
  },
} as const;

export type RunsCancelFlags = typeof runsCancelFlags;
```

**2. Создать `plugins/workflow/entry/src/commands/runs-cancel.ts`**

```typescript
/**
 * workflow:runs-cancel <runId> command — cancel an active workflow run
 */
import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunsCancelFlags {
  'run-id'?: string;
  json?: boolean;
}

export default defineCommand<unknown, CLIInput<RunsCancelFlags>, { exitCode: number }>({
  id: 'workflow:runs-cancel',
  description: 'Cancel a workflow run',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<RunsCancelFlags>) {
      const runId = input.flags?.['run-id'] ?? input.argv[0];
      return {
        summary: `Cancel workflow run ${runId ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'workflow-run', details: { runId } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<RunsCancelFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];

      if (!runId) {
        validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs cancel <runId> [--run-id=<id>]', outputJson);
        return { exitCode: 1 };
      }

      try {
        const client = new WorkflowDaemonClient();
        await client.cancelRun(runId);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: { runId, cancelled: true } });
        } else {
          ctx.ui?.success?.('Run Cancelled', {
            title: runId,
            sections: [
              {
                header: 'Details',
                items: [
                  `Run ID: ${runId}`,
                  `Status: cancellation requested`,
                  ``,
                  `View: kb workflow runs view ${runId}`,
                ],
              },
            ],
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { exitCode: 1 };
      }
    },
  },
});
```

**3. Зарегистрировать команду в `plugins/workflow/entry/src/manifest.ts`**

- Импортировать `runsCancelFlags` из `'./flags.js'`
- После блока регистрации `'workflow runs rerun'` (строка ~236) добавить новый объект команды:
```typescript
{
  path: 'workflow runs cancel',
  category: 'Runs',
  operationType: 'mutate' as const,
  describe: 'Cancel a workflow run.',
  longDescription:
    'Cancels an active workflow run. If the run is already finished, prints a clear error.',
  handler: './commands/runs-cancel.js#default',
  flags: defineCommandFlags(runsCancelFlags),
  examples: [
    'kb workflow runs cancel <runId>',
    'kb workflow runs cancel --run-id=<runId>',
    'kb workflow runs cancel <runId> --json',
  ],
},
```

**4. Создать `plugins/workflow/entry/src/__tests__/cli/runs-cancel.cli.test.ts`**

Тесты по паттерну `runs-rerun.cli.test.ts`:
- `RCX-01`: успешная отмена — `exitCode: 0`, вызов `success` с подтверждением
- `RCX-02`: `--json` возвращает `{ ok: true, data: { runId, cancelled: true } }`
- `RCX-03`: `--run-id` флаг как алиас для позиционного аргумента
- `RCX-04`: отсутствующий `runId` — `exitCode: 1`, вызов `validationError`
- `RCX-05`: daemon недоступен (сеть) — `exitCode: 1`, `handleError` отрабатывает
- `RCX-06`: daemon возвращает HTTP 404/409 (run не найден / уже завершён) — `exitCode: 1`, сообщение об ошибке

## Tests / verification

```bash
# Запустить только новые тесты (без daemon)
pnpm --filter @kb-labs/workflow-entry run test:cli -- --reporter=verbose runs-cancel

# Убедиться, что все handler-тесты проходят
pnpm --filter @kb-labs/workflow-entry run test:cli

# Проверить type-check
pnpm --filter @kb-labs/workflow-entry type-check

# Проверить сборку
kb-devkit run build --affected

# Smoke-test с живым daemon (опционально, требует kb-dev start)
kb-dev start
pnpm kb workflow runs list --json | jq '.[0].id'   # взять живой runId
pnpm kb workflow runs cancel <runId>
pnpm kb workflow runs cancel <runId> --json
pnpm kb workflow runs cancel nonexistent-id        # проверить ошибку
```
