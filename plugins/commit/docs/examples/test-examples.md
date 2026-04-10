# Test Examples

This document shows testing patterns for CLI commands, REST handlers, Studio widgets, and core business logic.

## Testing CLI commands

### Basic command test

```typescript
import { describe, it, expect, vi } from 'vitest';
import { run } from '../../src/cli/commands/run.js';

describe('hello command', () => {
  it('should greet user with provided name', async () => {
    const ctx = {
      logger: {
        info: vi.fn(),
        error: vi.fn()
      },
      output: {
        write: vi.fn()
      }
    };

    const result = await run.handler(ctx, {}, { name: 'Alice' });

    // Assert return value
    expect(result).toMatchObject({
      message: 'Hello, Alice!',
      target: 'Alice'
    });

    // Assert logging
    expect(ctx.logger.info).toHaveBeenCalledWith(
      'Hello command started',
      { name: 'Alice' }
    );

    // Assert output
    expect(ctx.output.write).toHaveBeenCalledWith('Hello, Alice!\n');
  });

  it('should use default name when not provided', async () => {
    const ctx = {
      logger: { info: vi.fn() },
      output: { write: vi.fn() }
    };

    const result = await run.handler(ctx, {}, {});

    expect(result.target).toBe('World');
    expect(ctx.output.write).toHaveBeenCalledWith('Hello, World!\n');
  });
});
```

### Testing command validation

```typescript
import { ValidationError } from '../../src/utils/errors.js';

describe('create-project command', () => {
  it('should validate project name format', async () => {
    const ctx = {
      logger: { error: vi.fn() },
      output: { write: vi.fn() }
    };

    // Invalid name (uppercase not allowed)
    await expect(
      run.handler(ctx, {}, { name: 'MyProject' })
    ).rejects.toThrow(ValidationError);

    await expect(
      run.handler(ctx, {}, { name: 'MyProject' })
    ).rejects.toThrow('Name must be lowercase');
  });

  it('should accept valid project name', async () => {
    const ctx = {
      logger: { info: vi.fn() },
      output: { write: vi.fn() }
    };

    const result = await run.handler(ctx, {}, {
      name: 'my-awesome-project'
    });

    expect(result.ok).toBe(true);
    expect(result.project.name).toBe('my-awesome-project');
  });
});
```

### Testing error handling

```typescript
import { NotFoundError } from '../../src/utils/errors.js';
import * as core from '../../src/core/user-operations.js';

describe('delete-user command', () => {
  it('should handle user not found', async () => {
    vi.spyOn(core, 'findUser').mockResolvedValue(null);

    const ctx = {
      logger: { error: vi.fn() },
      output: { write: vi.fn() }
    };

    await expect(
      run.handler(ctx, {}, { userId: 'nonexistent' })
    ).rejects.toThrow(NotFoundError);

    expect(ctx.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
      expect.any(Object)
    );
  });

  it('should successfully delete existing user', async () => {
    vi.spyOn(core, 'findUser').mockResolvedValue({
      id: 'user-123',
      name: 'John'
    });
    vi.spyOn(core, 'deleteUser').mockResolvedValue(true);

    const ctx = {
      logger: { info: vi.fn() },
      output: { write: vi.fn() }
    };

    const result = await run.handler(ctx, {}, { userId: 'user-123' });

    expect(result.ok).toBe(true);
    expect(core.deleteUser).toHaveBeenCalledWith('user-123');
  });
});
```

## Testing REST handlers

### Basic handler test

```typescript
import { describe, it, expect, vi } from 'vitest';
import { handleHello } from '../../src/rest/handlers/hello-handler.js';

describe('handleHello', () => {
  it('should process valid request', async () => {
    const input = { name: 'World' };
    const ctx = {
      output: { info: vi.fn() },
      requestId: 'req-123'
    };

    const result = await handleHello.handle(input, ctx);

    expect(result).toMatchObject({
      message: 'Hello, World!',
      target: 'World'
    });

    expect(ctx.output.info).toHaveBeenCalledWith(
      'Hello REST handler started',
      expect.objectContaining({ name: 'World' })
    );
  });

  it('should use default name', async () => {
    const input = {};
    const ctx = {};

    const result = await handleHello.handle(input, ctx);

    expect(result.target).toBe('World');
  });
});
```

### Testing Zod validation

```typescript
import { handleCreateUser } from '../../src/rest/handlers/user-handler.js';

describe('handleCreateUser validation', () => {
  it('should reject invalid email', async () => {
    const invalidInput = {
      name: 'John',
      email: 'not-an-email',
      age: 25
    };

    await expect(
      handleCreateUser.handle(invalidInput, {})
    ).rejects.toThrow(); // Zod throws validation error
  });

  it('should reject age below minimum', async () => {
    const invalidInput = {
      name: 'John',
      email: 'john@example.com',
      age: 17 // Below 18
    };

    await expect(
      handleCreateUser.handle(invalidInput, {})
    ).rejects.toThrow('Must be 18 or older');
  });

  it('should accept valid user', async () => {
    const validInput = {
      name: 'John Doe',
      email: 'john@example.com',
      age: 25
    };

    const ctx = { output: { info: vi.fn() } };
    const result = await handleCreateUser.handle(validInput, ctx);

    expect(result.userId).toBeDefined();
    expect(result.createdAt).toBeDefined();
  });
});
```

### Testing with mocked dependencies

```typescript
import * as userOps from '../../src/core/user-operations.js';

describe('handleGetUser', () => {
  it('should return user when found', async () => {
    const mockUser = {
      id: 'user-123',
      name: 'John Doe',
      email: 'john@example.com'
    };

    vi.spyOn(userOps, 'findUser').mockResolvedValue(mockUser);

    const input = { userId: 'user-123' };
    const ctx = {};

    const result = await handleGetUser.handle(input, ctx);

    expect(result.user).toEqual(mockUser);
    expect(userOps.findUser).toHaveBeenCalledWith('user-123');
  });

  it('should throw NotFoundError when user not found', async () => {
    vi.spyOn(userOps, 'findUser').mockResolvedValue(null);

    const input = { userId: 'nonexistent' };

    await expect(
      handleGetUser.handle(input, {})
    ).rejects.toThrow(NotFoundError);
  });
});
```

## Testing Studio widgets

### Basic widget rendering

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelloWidget } from '../../src/studio/widgets/hello-widget.js';

describe('HelloWidget', () => {
  it('should render message and target', () => {
    const data = {
      message: 'Hello, Test!',
      target: 'Test'
    };

    render(<HelloWidget data={data} />);

    expect(screen.getByText('Hello from Plugin Template')).toBeInTheDocument();
    expect(screen.getByText('Hello, Test!')).toBeInTheDocument();
    expect(screen.getByText(/Target: Test/)).toBeInTheDocument();
  });

  it('should render without target', () => {
    const data = {
      message: 'Hello, World!',
      target: undefined
    };

    render(<HelloWidget data={data} />);

    expect(screen.getByText('Hello, World!')).toBeInTheDocument();
    expect(screen.queryByText(/Target:/)).not.toBeInTheDocument();
  });
});
```

### Testing loading/error/empty states

```typescript
describe('HelloWidget states', () => {
  it('should show loading state', () => {
    render(<HelloWidget loading />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should show error state', () => {
    const error = new Error('Failed to load data');

    render(<HelloWidget error={error} />);

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load data')).toBeInTheDocument();
  });

  it('should show empty state when no data', () => {
    render(<HelloWidget />);

    expect(screen.getByText('No greeting data available')).toBeInTheDocument();
  });
});
```

### Testing interactive widgets

```typescript
import { fireEvent } from '@testing-library/react';

describe('FilterWidget', () => {
  it('should filter items by status', () => {
    const data = {
      items: [
        { id: '1', name: 'Item 1', status: 'active' },
        { id: '2', name: 'Item 2', status: 'done' },
        { id: '3', name: 'Item 3', status: 'active' }
      ]
    };

    render(<FilterWidget data={data} />);

    // Initially shows all items
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();

    // Filter to 'active' only
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'active' } });

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Item 2')).not.toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });
});
```

## Testing core business logic

### Pure function tests

```typescript
import { describe, it, expect } from 'vitest';
import { createGreeting } from '../../src/core/greeting.js';

describe('createGreeting', () => {
  it('should create greeting with target', () => {
    const result = createGreeting('Alice');

    expect(result).toEqual({
      message: 'Hello, Alice!',
      target: 'Alice'
    });
  });

  it('should use default target', () => {
    const result = createGreeting();

    expect(result).toEqual({
      message: 'Hello, World!',
      target: 'World'
    });
  });

  it('should handle empty string', () => {
    const result = createGreeting('');

    expect(result.target).toBe('World'); // Falls back to default
  });
});
```

### Testing complex business logic

```typescript
import { calculateOrderTotal, applyDiscount } from '../../src/core/orders.js';

describe('Order calculations', () => {
  it('should calculate total with multiple items', () => {
    const items = [
      { price: 10, quantity: 2 },
      { price: 25, quantity: 1 },
      { price: 5, quantity: 3 }
    ];

    const total = calculateOrderTotal(items);

    expect(total).toBe(60); // (10*2) + (25*1) + (5*3)
  });

  it('should apply percentage discount', () => {
    const total = 100;
    const discount = { type: 'percentage', value: 10 };

    const final = applyDiscount(total, discount);

    expect(final).toBe(90);
  });

  it('should apply fixed discount', () => {
    const total = 100;
    const discount = { type: 'fixed', value: 15 };

    const final = applyDiscount(total, discount);

    expect(final).toBe(85);
  });

  it('should not apply discount below zero', () => {
    const total = 10;
    const discount = { type: 'fixed', value: 50 };

    const final = applyDiscount(total, discount);

    expect(final).toBe(0);
  });
});
```

## Integration tests

### Testing full CLI flow

```typescript
import { runCommand } from '../../src/cli/index.js';

describe('create-project integration', () => {
  it('should create project with all steps', async () => {
    const ctx = {
      logger: { info: vi.fn() },
      output: { write: vi.fn() },
      runtime: {
        fs: {
          mkdir: vi.fn(),
          writeFile: vi.fn()
        }
      }
    };

    const result = await runCommand(
      'template:create-project',
      { name: 'my-project', template: 'basic' },
      ctx
    );

    // Verify filesystem operations
    expect(ctx.runtime.fs.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('my-project'),
      expect.any(Object)
    );

    expect(ctx.runtime.fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('package.json'),
      expect.any(String)
    );

    // Verify result
    expect(result.ok).toBe(true);
    expect(result.project.name).toBe('my-project');
  });
});
```

### Testing REST + Core integration

```typescript
import { handleCreateOrder } from '../../src/rest/handlers/order-handler.js';
import * as orderOps from '../../src/core/order-operations.js';

describe('Order creation integration', () => {
  it('should validate, create, and return order', async () => {
    const createOrderSpy = vi.spyOn(orderOps, 'createOrder');
    createOrderSpy.mockResolvedValue({
      id: 'order-123',
      total: 100,
      createdAt: new Date()
    });

    const input = {
      customerId: 'cust-456',
      items: [
        { productId: 'prod-1', quantity: 2, price: 50 }
      ]
    };

    const ctx = {
      output: { info: vi.fn() },
      requestId: 'req-789'
    };

    const result = await handleCreateOrder.handle(input, ctx);

    // Verify core function called with validated input
    expect(createOrderSpy).toHaveBeenCalledWith({
      customerId: 'cust-456',
      items: expect.arrayContaining([
        expect.objectContaining({ quantity: 2 })
      ])
    });

    // Verify response format
    expect(result.orderId).toBe('order-123');
    expect(result.total).toBe(100);
  });
});
```

## Test utilities

### Mock context factory

```typescript
// tests/utils/mock-context.ts
import { vi } from 'vitest';

export function createMockCliContext(overrides = {}) {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    output: {
      write: vi.fn()
    },
    runtime: {
      fs: {
        mkdir: vi.fn(),
        writeFile: vi.fn(),
        readFile: vi.fn().mockResolvedValue(''),
        rm: vi.fn()
      },
      config: {
        get: vi.fn(),
        set: vi.fn()
      }
    },
    requestId: 'test-req-123',
    ...overrides
  };
}

// Usage
it('should work', async () => {
  const ctx = createMockCliContext();
  await run.handler(ctx, {}, { name: 'Test' });
  expect(ctx.logger.info).toHaveBeenCalled();
});
```

### Custom matchers

```typescript
// tests/utils/matchers.ts
import { expect } from 'vitest';

expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    return {
      pass,
      message: () => pass
        ? `expected ${received} not to be a valid UUID`
        : `expected ${received} to be a valid UUID`
    };
  }
});

// Usage
it('should return valid UUID', () => {
  const result = generateId();
  expect(result).toBeValidUUID();
});
```

## Best practices

### ✅ DO

- **Test behavior, not implementation** - focus on inputs/outputs
- **Use descriptive test names** - explain what scenario is being tested
- **Arrange-Act-Assert pattern** - clear test structure
- **Mock external dependencies** - isolate unit under test
- **Test edge cases** - empty arrays, null values, boundary conditions
- **Test error paths** - not just happy path
- **Use factories for test data** - avoid duplication

### ❌ DON'T

- Don't test implementation details
- Don't create interdependent tests (test isolation!)
- Don't skip error cases
- Don't forget to clean up mocks (`vi.restoreAllMocks()`)
- Don't use real filesystem/network in unit tests
- Don't write tests without assertions

## Running tests

```bash
# Run all tests
pnpm --filter @kb-labs/plugin-template-core run test

# Run tests in watch mode
pnpm --filter @kb-labs/plugin-template-core run test:watch

# Run tests with coverage
pnpm --filter @kb-labs/plugin-template-core run test -- --coverage

# Run specific test file
pnpm test cli/commands/run.test.ts

# Run tests matching pattern
pnpm test --grep "validation"
```

## Related documentation

- [Vitest Documentation](https://vitest.dev) - Testing framework
- [React Testing Library](https://testing-library.com/react) - Widget testing
- [utils/errors.ts](../../packages/plugin-template-core/src/utils/errors.ts) - Error classes
