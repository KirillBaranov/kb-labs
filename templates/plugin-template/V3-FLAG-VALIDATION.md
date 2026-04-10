# V3 Flag Validation Guide

**Ответ на вопрос:** Да, в V3 есть **мощная система валидации флагов**!

## Обзор

Флаги в V3 определяются **дважды**:

1. **В manifest** - для CLI парсинга (через `defineCommandFlags`)
2. **В команде** - TypeScript типы для type safety

Валидация происходит **автоматически** на основе схемы в манифесте.

## Типы Флагов

### Базовые Типы
- `boolean` - true/false
- `string` - текстовая строка
- `number` - число
- `array` - массив значений

### Определение в Manifest

```typescript
import { defineCommandFlags } from '@kb-labs/sdk';

flags: defineCommandFlags({
  name: {
    type: 'string',
    description: 'User name',
    default: 'World',
    alias: 'n',

    // Валидация:
    required: false,           // Обязательный флаг
    minLength: 2,              // Мин. длина строки
    maxLength: 50,             // Макс. длина строки
    pattern: /^[a-zA-Z]+$/,    // Regex паттерн
    choices: ['dev', 'prod'],  // Enum значений
    validate: async (value) => {  // Кастомная валидация
      if (value.includes('bad')) {
        return 'Name cannot contain "bad"';
      }
      return true;  // Валидация прошла
    },
  },

  age: {
    type: 'number',
    description: 'User age',
    required: true,
    min: 18,        // Минимум
    max: 120,       // Максимум
    validate: (value) => {
      if (value < 0) return 'Age must be positive';
      return true;
    },
  },

  verbose: {
    type: 'boolean',
    description: 'Verbose output',
    default: false,
    alias: 'v',
  },

  tags: {
    type: 'array',
    description: 'Tags list',
    items: 'string',   // Тип элементов массива
    minLength: 1,      // Мин. кол-во элементов
    maxLength: 10,     // Макс. кол-во элементов
  },
})
```

## Расширенная Валидация

### 1. Required Flags

```typescript
flags: defineCommandFlags({
  apiKey: {
    type: 'string',
    required: true,  // Обязательный флаг
    description: 'API key (required)',
  },
})
```

**Ошибка если не передан:**
```
Error: Flag --apiKey is required
```

### 2. Choices (Enum)

```typescript
flags: defineCommandFlags({
  environment: {
    type: 'string',
    choices: ['dev', 'staging', 'prod'],  // Только эти значения
    default: 'dev',
    description: 'Target environment',
  },
})
```

**Ошибка если неверное значение:**
```
Error: Flag --environment must be one of: dev, staging, prod (got: production)
```

### 3. Pattern (Regex)

```typescript
flags: defineCommandFlags({
  email: {
    type: 'string',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    description: 'User email',
  },
})
```

**Ошибка если не соответствует:**
```
Error: Flag --email must match pattern /^[^\s@]+@[^\s@]+\.[^\s@]+$/
```

### 4. Min/Max для String

```typescript
flags: defineCommandFlags({
  username: {
    type: 'string',
    minLength: 3,
    maxLength: 20,
    description: 'Username (3-20 chars)',
  },
})
```

**Ошибки:**
```
Error: Flag --username must be at least 3 characters long
Error: Flag --username must be at most 20 characters long
```

### 5. Min/Max для Number

```typescript
flags: defineCommandFlags({
  port: {
    type: 'number',
    min: 1024,
    max: 65535,
    default: 3000,
    description: 'Server port',
  },
})
```

**Ошибки:**
```
Error: Flag --port must be >= 1024 (got: 80)
Error: Flag --port must be <= 65535 (got: 70000)
```

### 6. Custom Validation (Async)

```typescript
flags: defineCommandFlags({
  scope: {
    type: 'string',
    description: 'Package scope',
    validate: async (value) => {
      // Проверка существования пакета
      const exists = await checkPackageExists(value);
      if (!exists) {
        return `Package ${value} does not exist`;
      }
      return true;  // Валидация прошла
    },
  },
})
```

**Return:**
- `true` - валидация прошла
- `string` - сообщение об ошибке

### 7. Array Validation

```typescript
flags: defineCommandFlags({
  ids: {
    type: 'array',
    items: 'number',   // Каждый элемент - number
    minLength: 1,      // Хотя бы один элемент
    maxLength: 100,    // Не больше 100
    description: 'User IDs',
  },
})
```

**Ошибки:**
```
Error: Flag --ids must have at least 1 items
Error: Flag --ids[0] must be a number
```

### 8. Conflicts

```typescript
flags: defineCommandFlags({
  prod: {
    type: 'boolean',
    description: 'Production mode',
    conflicts: ['dev', 'staging'],  // Нельзя использовать вместе
  },
  dev: {
    type: 'boolean',
    description: 'Development mode',
  },
  staging: {
    type: 'boolean',
    description: 'Staging mode',
  },
})
```

**Ошибка:**
```
Error: Flag --prod conflicts with --dev
```

### 9. Dependencies

```typescript
flags: defineCommandFlags({
  push: {
    type: 'boolean',
    description: 'Push to remote',
    dependsOn: ['branch'],  // Требует --branch
  },
  branch: {
    type: 'string',
    description: 'Branch name',
  },
})
```

**Ошибка:**
```
Error: Flag --push depends on --branch
```

### 10. Implies (Auto-set)

```typescript
flags: defineCommandFlags({
  production: {
    type: 'boolean',
    description: 'Production mode',
    implies: ['optimize', ['minify', true]],  // Автоматически устанавливает флаги
  },
  optimize: {
    type: 'boolean',
    default: false,
  },
  minify: {
    type: 'boolean',
    default: false,
  },
})
```

**Когда используется `--production`:**
- Автоматически: `optimize = true`
- Автоматически: `minify = true`

### 11. Transform (Преобразование)

```typescript
flags: defineCommandFlags({
  path: {
    type: 'string',
    description: 'File path',
    transform: async (value) => {
      // Преобразовать в абсолютный путь
      return path.resolve(value);
    },
  },
  tags: {
    type: 'array',
    items: 'string',
    transform: async (value) => {
      // Привести к lowercase
      return value.map(tag => tag.toLowerCase());
    },
  },
})
```

## Примеры Использования

### Пример 1: Простая Валидация

```typescript
// manifest.v3.ts
flags: defineCommandFlags({
  name: {
    type: 'string',
    required: true,
    minLength: 2,
    maxLength: 50,
    description: 'Project name',
  },
  force: {
    type: 'boolean',
    default: false,
    description: 'Force operation',
  },
})

// command.ts
interface MyFlags {
  name: string;   // required - не undefined
  force?: boolean; // optional
}

handler: {
  async execute(ctx, input: { argv: string[], flags: MyFlags }) {
    // name гарантированно есть благодаря required: true
    console.log(`Creating project: ${input.flags.name}`);

    if (input.flags.force) {
      console.log('Force mode enabled');
    }
  }
}
```

### Пример 2: Enum Validation

```typescript
// manifest.v3.ts
flags: defineCommandFlags({
  env: {
    type: 'string',
    choices: ['dev', 'staging', 'prod'],
    default: 'dev',
    description: 'Environment',
  },
})

// command.ts
interface MyFlags {
  env: 'dev' | 'staging' | 'prod';  // TypeScript enum
}

handler: {
  async execute(ctx, input) {
    // env всегда один из трех вариантов
    if (input.flags.env === 'prod') {
      console.log('Running in production!');
    }
  }
}
```

### Пример 3: Custom Async Validation

```typescript
// manifest.v3.ts
flags: defineCommandFlags({
  package: {
    type: 'string',
    required: true,
    description: 'Package name',
    validate: async (value) => {
      // Проверка формата
      if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(value)) {
        return 'Package must be scoped (e.g., @kb-labs/my-package)';
      }

      // Проверка существования
      try {
        const exists = await fetch(`https://registry.npmjs.org/${value}`);
        if (!exists.ok) {
          return `Package ${value} does not exist in npm registry`;
        }
      } catch (err) {
        return 'Failed to check package existence';
      }

      return true;
    },
  },
})
```

### Пример 4: Complex Validation

```typescript
// manifest.v3.ts
flags: defineCommandFlags({
  mode: {
    type: 'string',
    choices: ['local', 'remote'],
    default: 'local',
    description: 'Operation mode',
  },

  host: {
    type: 'string',
    description: 'Remote host',
    pattern: /^https?:\/\/.+$/,  // URL pattern
    dependsOn: ['mode'],  // Требует --mode
    validate: async (value) => {
      // Дополнительная проверка
      const url = new URL(value);
      if (url.protocol !== 'https:') {
        return 'Only HTTPS URLs are allowed';
      }
      return true;
    },
  },

  port: {
    type: 'number',
    min: 1,
    max: 65535,
    default: 443,
    description: 'Remote port',
  },

  auth: {
    type: 'boolean',
    description: 'Use authentication',
    implies: [['token', true]],  // Автоматически требует token
  },

  token: {
    type: 'string',
    description: 'Auth token',
    minLength: 10,
    pattern: /^[a-zA-Z0-9_-]+$/,
  },
})
```

## Как Работает Валидация

### 1. Runtime Валидация

CLI framework автоматически валидирует флаги **перед** вызовом handler:

```typescript
// CLI парсит флаги
const rawFlags = parseCliArgs(process.argv);

// Автоматическая валидация
const validatedFlags = await validateFlags(rawFlags, flagsSchema);

// Handler вызывается только если валидация прошла
await handler.execute(ctx, { argv, flags: validatedFlags });
```

### 2. Type Safety

TypeScript гарантирует соответствие типов:

```typescript
// Manifest определяет runtime схему
flags: defineCommandFlags({
  name: { type: 'string', required: true },
  count: { type: 'number', default: 10 },
})

// Command определяет TypeScript типы
interface MyFlags {
  name: string;   // required - не undefined
  count?: number; // optional (есть default)
}

// TypeScript проверяет соответствие
handler: {
  execute(ctx, input: { argv: string[], flags: MyFlags }) {
    // name доступен без проверки на undefined
    console.log(input.flags.name.toUpperCase());

    // count может быть undefined
    if (input.flags.count) {
      console.log(`Count: ${input.flags.count}`);
    }
  }
}
```

## Ошибки Валидации

### Формат Ошибок

```typescript
class FlagValidationError extends Error {
  flag: string;      // Имя флага
  message: string;   // Сообщение об ошибке
  value?: unknown;   // Переданное значение
  schema?: FlagSchemaDefinition;  // Схема флагов
}
```

### Обработка Ошибок

**Вариант 1: Throw (default)**
```typescript
try {
  const flags = await validateFlags(rawFlags, schema);
} catch (err) {
  if (err instanceof FlagValidationError) {
    console.error(`Validation failed for --${err.flag}: ${err.message}`);
  }
}
```

**Вариант 2: Safe Validation**
```typescript
const result = await validateFlagsSafe(rawFlags, schema);

if (!result.success) {
  result.errors.forEach(err => {
    console.error(`--${err.flag}: ${err.message}`);
  });
}
```

## Best Practices

### 1. Валидация в Manifest, Типы в Command

```typescript
// ✅ Good - Схема и типы синхронизированы
// manifest.v3.ts
flags: defineCommandFlags({
  name: { type: 'string', required: true },
})

// command.ts
interface MyFlags {
  name: string;  // Соответствует required: true
}
```

### 2. Use Specific Types

```typescript
// ✅ Good - Точные типы
interface MyFlags {
  env: 'dev' | 'staging' | 'prod';  // Enum
  port: number;  // Not number | undefined если default
}

// ❌ Bad - Слишком общие типы
interface MyFlags {
  env?: string;
  port?: number;
}
```

### 3. Validate Early

```typescript
// ✅ Good - Валидация в начале
handler: {
  async execute(ctx, input) {
    // Флаги уже провалидированы CLI
    const name = input.flags.name;  // Safe!

    // Дополнительная business логика валидация
    if (name === 'admin') {
      ctx.ui.error('Name "admin" is reserved');
      return { exitCode: 1 };
    }

    // Основная логика
  }
}
```

### 4. Use Custom Validation for Complex Cases

```typescript
flags: defineCommandFlags({
  config: {
    type: 'string',
    description: 'Config file path',
    validate: async (value) => {
      // Проверка существования файла
      try {
        await fs.access(value);

        // Проверка формата
        const content = await fs.readFile(value, 'utf-8');
        JSON.parse(content);  // Валидный JSON?

        return true;
      } catch (err) {
        return `Invalid config file: ${err.message}`;
      }
    },
  },
})
```

## Summary

### Флаги хранятся в двух местах:

1. **Manifest** (`manifest.v3.ts`):
   - `defineCommandFlags({ ... })` - runtime схема
   - Используется для CLI парсинга
   - Автоматическая валидация

2. **Command** (`command.ts`):
   - TypeScript интерфейсы (inline)
   - Compile-time type safety
   - IDE автодополнение

### Типы валидации:

✅ **Basic** - type, required, default
✅ **String** - minLength, maxLength, pattern, choices
✅ **Number** - min, max
✅ **Array** - items, minLength, maxLength
✅ **Custom** - async validate function
✅ **Relationships** - conflicts, dependsOn, implies
✅ **Transform** - преобразование значений

### Когда происходит валидация:

1. **CLI Parse** - автоматически перед handler
2. **Type Check** - compile-time через TypeScript
3. **Custom Logic** - в handler если нужна business логика

---

**Итого:** Да, в V3 есть **мощная валидация флагов** из коробки! 🎉
