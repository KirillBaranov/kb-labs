# UI API with MessageOptions

## Overview

The UI facade provides methods for displaying formatted output with optional enhanced styling using side-bordered boxes.

## MessageOptions Interface

```typescript
export interface MessageOptions {
  /** Optional title for the box (defaults to message type) */
  title?: string;
  /** Content sections to display in box */
  sections?: OutputSection[];
  /** Timing in milliseconds to display in footer */
  timing?: number;
}
```

## Enhanced UI Methods

All UI methods now support an optional second parameter `MessageOptions` for enhanced output:

### `ctx.ui.success(message, options?)`

Display a success message with optional side box.

**Simple usage:**
```typescript
ctx.ui.success('Operation completed!');
// Output: ✓ Operation completed!
```

**Enhanced usage:**
```typescript
ctx.ui.success('Operation completed!', {
  title: 'Build Success',
  sections: [
    {
      header: 'Summary',
      items: [
        'Files processed: 42',
        'Time taken: 2.3s',
      ],
    },
  ],
  timing: 2300, // ms
});
```

**Output:**
```
┌── Build Success
│
│ Summary
│  Files processed: 42
│  Time taken: 2.3s
│
└── OK Success / 2.3s
```

### `ctx.ui.info(message, options?)`

Display an informational message.

```typescript
ctx.ui.info('Processing files...', {
  title: 'Status',
  sections: [
    {
      header: 'Progress',
      items: ['Current: 15/42', 'Remaining: 27'],
    },
  ],
});
```

### `ctx.ui.warn(message, options?)`

Display a warning message.

```typescript
ctx.ui.warn('Configuration incomplete', {
  title: 'Warning',
  sections: [
    {
      header: 'Missing fields',
      items: ['API_KEY', 'REGION'],
    },
  ],
});
```

### `ctx.ui.error(error, options?)`

Display an error message.

```typescript
ctx.ui.error('Build failed', {
  title: 'Error',
  sections: [
    {
      header: 'Failed tasks',
      items: ['TypeScript compilation', 'Linting'],
    },
  ],
  timing: 1200,
});
```

## OutputSection Interface

```typescript
export interface OutputSection {
  /** Section header (optional) */
  header?: string;
  /** List of items in this section */
  items: string[];
}
```

## Examples

### Command execution report

```typescript
const startTime = Date.now();

// ... execute command ...

ctx.ui.success(`Deployed ${serviceName}`, {
  title: 'Deployment',
  sections: [
    {
      header: 'Details',
      items: [
        `Service: ${serviceName}`,
        `Environment: ${env}`,
        `Region: ${region}`,
      ],
    },
    {
      header: 'Resources',
      items: [
        `Functions: ${functions.length}`,
        `Endpoints: ${endpoints.length}`,
      ],
    },
  ],
  timing: Date.now() - startTime,
});
```

### Multi-step process

```typescript
// Step 1
ctx.ui.info('Starting backup...', {
  title: 'Backup',
  sections: [
    {
      header: 'Configuration',
      items: [
        `Database: ${dbName}`,
        `Target: ${backupLocation}`,
      ],
    },
  ],
});

// Step 2
ctx.ui.success('Backup completed', {
  title: 'Backup',
  sections: [
    {
      header: 'Summary',
      items: [
        `Size: ${formatBytes(backupSize)}`,
        `Duration: ${formatDuration(duration)}`,
        `Location: ${backupPath}`,
      ],
    },
  ],
  timing: duration,
});
```

## Backward Compatibility

All methods remain backward compatible. If `options` is not provided, methods display simple text output:

```typescript
// Old usage (still works)
ctx.ui.success('Done!');
// Output: ✓ Done!

// New usage (enhanced)
ctx.ui.success('Done!', { title: 'Success', timing: 100 });
// Output: side box with timing
```

## Status Indicators

The box footer displays status with color coding:

- **Success**: Green "OK Success"
- **Info**: Blue "INFO"
- **Warning**: Yellow "WARN"
- **Error**: Red "ERROR"

Timing is automatically formatted:
- `1200ms` → "1.2s"
- `500ms` → "500ms"
- `3600000ms` → "1h 0m"
