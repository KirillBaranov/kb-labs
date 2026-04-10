# Unified Output System

Единая система вывода и логирования для KB Labs платформы.

## Обзор

Output система предоставляет единый API для:
- Вывода информации пользователю (success, error, warn, info)
- Логирования (debug, trace)
- Прогресс-индикаторов (spinner, progress)
- Структурированного вывода (JSON, AI-friendly)
- UI утилит (box, table, keyValue, colors)

## Основные возможности

### Уровни verbosity

```typescript
// quiet - только ошибки
output.error('Something went wrong');

// normal (default) - ошибки, предупреждения, успешные результаты
output.success('Command completed');
output.warn('Deprecated feature');
output.error('Error occurred');

// verbose - + информационные сообщения
output.info('Processing files...');

// debug - + debug информация
output.debug('Internal state:', { state });

// inspect - всё, включая trace
output.trace('Detailed trace information');
```

### Режимы вывода

Система автоматически определяет режим:
- **TTY** - интерактивный терминал (красивый вывод с цветами)
- **Pipe** - вывод в pipe (plain text без цветов)
- **CI** - CI окружение (структурированный вывод)
- **JSON** - при флаге `--json` (структурированный JSON)

### Форматы

- **human** (default) - человекочитаемый формат с цветами и форматированием
- **ai** - минималистичный формат для LLM (при `--debug-format=ai`)

## Использование в плагинах

### Базовое использование

```typescript
import type { CliHandlerContext } from '@kb-labs/sandbox';

export async function run(ctx: CliHandlerContext) {
  const { output } = ctx;
  
  // Успешный результат
  output.success('Command completed successfully', {
    filesProcessed: 42,
    duration: 1234,
  });
  
  // Ошибка с suggestions
  try {
    await doWork();
  } catch (error) {
    output.error(error, {
      title: 'Operation failed',
      code: 'E_OPERATION_FAILED',
      suggestions: [
        'Check that files are readable',
        'Verify permissions',
        'Try: kb command --verbose',
      ],
      docs: 'https://kb-labs.dev/docs/errors/E_OPERATION_FAILED',
    });
    return 1;
  }
  
  return 0;
}
```

### Прогресс операций

```typescript
// Spinner для длительных операций
const spinner = output.spinner('Processing files...');
spinner.start();

try {
  for (let i = 0; i < files.length; i++) {
    await processFile(files[i]);
    
    // Обновить прогресс
    output.progress('Processing files', {
      current: i + 1,
      total: files.length,
      message: `File ${files[i]}`,
    });
  }
  
  spinner.succeed('All files processed');
} catch (error) {
  spinner.fail('Processing failed');
  throw error;
}
```

### Debug информация

```typescript
// Debug информация (только с --debug)
output.debug('Vector search started', {
  scopeId: 'default',
  queryText: 'example',
  chunks: 10,
});

// Trace информация (только с --debug=inspect)
output.trace('Detailed execution trace', {
  step: 'vector-search',
  duration: 123,
  memory: 45,
});
```

### Использование UI утилит

```typescript
const { ui } = output;

// Box для структурированного вывода
const summary = ui.keyValue({
  'Files processed': stats.files,
  'Duration': formatDuration(stats.duration),
  'Size': formatSize(stats.size),
});

const boxed = ui.box('Summary', summary);
output.write(boxed);

// Таблица
const table = ui.table(
  [
    ['File 1', '100 KB'],
    ['File 2', '200 KB'],
  ],
  ['File', 'Size']
);

output.write(table.join('\n'));

// Цвета и символы
output.write(`${ui.symbols.success} ${ui.colors.success('Success!')}`);
output.write(`${ui.symbols.error} ${ui.colors.error('Error!')}`);
```

### JSON режим

При флаге `--json` все методы автоматически выводят структурированный JSON:

```typescript
// В JSON режиме
output.success('Done', { count: 42 });
// Выводит: { "ok": true, "message": "Done", "count": 42 }

output.error(error, { code: 'E_ERROR' });
// Выводит: { "ok": false, "error": { "message": "...", "code": "E_ERROR" } }
```

## Конфигурация

### Создание Output

```typescript
import { createOutput } from '@kb-labs/core-sys/output';

const output = createOutput({
  verbosity: 'normal', // 'quiet' | 'normal' | 'verbose' | 'debug' | 'inspect'
  format: 'human',     // 'human' | 'ai'
  json: false,         // true для JSON режима
  category: 'my-plugin',
  context: {
    plugin: '@vendor/plugin',
    command: 'my-command',
    trace: 'abc123',
  },
});
```

### Environment Variables

```bash
# Уровень verbosity
KB_LOG_LEVEL=debug           # trace, debug, info, warn, error
KB_VERBOSITY=verbose         # quiet, normal, verbose, debug, inspect

# Формат
KB_DEBUG_FORMAT=ai           # human, ai
KB_OUTPUT_MODE=json          # tty, pipe, ci, json
```

## Логирование в файлы

Все логи автоматически сохраняются в `.kb/logs/current.jsonl` в формате JSON Lines:

```json
{"ts":"2025-11-18T19:46:03.639Z","level":"info","category":"plugin:@kb-labs/mind","plugin":"@kb-labs/mind","command":"rag-query","trace":"abc123","msg":"Command completed","meta":{"filesProcessed":42}}
```

Логи ротируются автоматически:
- По размеру: новый файл при достижении 10MB
- По дате: новый файл каждый день
- Архив: `.kb/logs/kb-YYYY-MM-DD.jsonl`

## Миграция с presenter

Старый код:
```typescript
ctx.presenter.info('Message');
ctx.presenter.error('Error');
ctx.presenter.json({ data });
```

Новый код:
```typescript
ctx.output.info('Message');
ctx.output.error('Error');
ctx.output.json({ data });
```

`ctx.presenter` остается доступным для обратной совместимости, но рекомендуется использовать `ctx.output`.

## Best Practices

1. **Используйте правильные уровни**:
   - `success` - для успешных результатов
   - `error` - для ошибок с suggestions
   - `warn` - для предупреждений
   - `info` - для информационных сообщений (только --verbose)
   - `debug` - для debug информации (только --debug)

2. **Предоставляйте контекст**:
   ```typescript
   output.error(error, {
     code: 'E_MY_ERROR',
     suggestions: ['Fix 1', 'Fix 2'],
     docs: 'https://docs.example.com/errors/E_MY_ERROR',
   });
   ```

3. **Используйте прогресс для длительных операций**:
   ```typescript
   output.progress('Processing', { current: 5, total: 10 });
   ```

4. **Группируйте связанные логи**:
   ```typescript
   output.group('Database operations');
   output.debug('Connected');
   output.debug('Query executed');
   output.groupEnd();
   ```

5. **Проверяйте режимы**:
   ```typescript
   if (output.isQuiet) return;
   if (output.isVerbose) {
     output.info('Additional details');
   }
   ```


