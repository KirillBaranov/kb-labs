/**
 * @module @kb-labs/shared-command-kit/__tests__/define-system-command
 *
 * Tests for defineSystemCommand - system commands using PluginContextV3.
 *
 * CRITICAL: System commands receive EnhancedCliContext (PluginContextV3 + helpers)
 * and run with SYSTEM_UNRESTRICTED_PERMISSIONS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineSystemCommand, defineSystemCommandGroup } from '../define-system-command';

describe('defineSystemCommand', () => {
  let mockCtx: any; // EnhancedCliContext (PluginContextV3 + helpers)
  let mockUI: {
    write: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockUI = {
      write: vi.fn(),
      json: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    // Pure PluginContextV3 (no EnhancedCliContext, no tracker, no output helpers)
    mockCtx = {
      host: 'cli',
      requestId: 'test-request-id',
      pluginId: '@kb-labs/system',
      cwd: '/test',
      ui: mockUI,
      platform: {
        logger: mockLogger as unknown as any,
        llm: {} as any,
        embeddings: {} as any,
        vectorStore: {} as any,
        cache: {} as any,
        storage: {} as any,
        analytics: {} as any,
      },
      runtime: {
        fs: {} as any,
        fetch: vi.fn(),
        env: vi.fn(),
      } as any,
      api: {} as any,
      trace: {
        traceId: 'test-trace-id',
        spanId: 'test-span-id',
      },
    };
  });

  describe('Basic Command Creation', () => {
    it('should create a command with correct metadata', () => {
      const command = defineSystemCommand({
        name: 'test-cmd',
        description: 'Test command',
        longDescription: 'Long description',
        category: 'testing',
        aliases: ['tc', 'test'],
        examples: ['kb test-cmd --flag value'],
        flags: {
          flag: { type: 'string', description: 'A test flag' },
        },
        handler: async () => ({ ok: true }),
      });

      expect(command.name).toBe('test-cmd');
      expect(command.describe).toBe('Test command');
      expect(command.longDescription).toBe('Long description');
      expect(command.category).toBe('testing');
      expect(command.aliases).toEqual(['tc', 'test']);
      expect(command.examples).toEqual(['kb test-cmd --flag value']);
      expect(command.flags).toHaveLength(1);
      const firstFlag = command.flags![0]!;
      expect(firstFlag.name).toBe('flag');
      expect(firstFlag.type).toBe('string');
    });

    it('should default category to "system"', () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => ({ ok: true }),
      });

      expect(command.category).toBe('system');
    });

    it('should default aliases to empty array', () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => ({ ok: true }),
      });

      expect(command.aliases).toEqual([]);
    });

    it('should default examples to empty array', () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => ({ ok: true }),
      });

      expect(command.examples).toEqual([]);
    });
  });

  describe('Flag Schema Conversion', () => {
    it('should convert flag schema to FlagDefinition[]', () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {
          name: { type: 'string', description: 'Name', required: true },
          count: { type: 'number', default: 10 },
          verbose: { type: 'boolean', alias: 'v' },
        },
        handler: async () => ({ ok: true }),
      });

      expect(command.flags).toHaveLength(3);

      const nameFlag = command.flags!.find(f => f.name === 'name');
      expect(nameFlag).toEqual({
        name: 'name',
        type: 'string',
        description: 'Name',
        required: true,
        alias: undefined,
        default: undefined,
      });

      const countFlag = command.flags!.find(f => f.name === 'count');
      expect(countFlag).toEqual({
        name: 'count',
        type: 'number',
        description: undefined,
        default: 10,
        required: undefined,
        alias: undefined,
      });

      const verboseFlag = command.flags!.find(f => f.name === 'verbose');
      expect(verboseFlag).toEqual({
        name: 'verbose',
        type: 'boolean',
        alias: 'v',
        description: undefined,
        default: undefined,
        required: undefined,
      });
    });

    it('should handle choices for string flags', () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {
          mode: { type: 'string', choices: ['dev', 'prod'] as const },
        },
        handler: async () => ({ ok: true }),
      });

      const modeFlag = command.flags!.find(f => f.name === 'mode');
      expect(modeFlag!.choices).toEqual(['dev', 'prod']);
    });
  });

  describe('Handler Execution', () => {
    it('should call handler with EnhancedCliContext', async () => {
      const handler = vi.fn().mockResolvedValue({ ok: true });

      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler,
      });

      await command.run(mockCtx, [], {});

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'cli',
          pluginId: '@kb-labs/system',
          ui: mockUI,
          platform: expect.objectContaining({ logger: mockLogger }),
          runtime: expect.any(Object),
          trace: expect.objectContaining({ traceId: 'test-trace-id' }),
          // Removed: tracker is no longer added (pure PluginContextV3)
        }),
        [],
        {}
      );
    });

    it('should return 0 for successful CommandResult', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => ({ ok: true, data: 'success' }),
      });

      const exitCode = await command.run(mockCtx, [], {});
      expect(exitCode).toBe(0);
    });

    it('should return 1 for failed CommandResult', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => ({ ok: false, error: 'failed' }),
      });

      const exitCode = await command.run(mockCtx, [], {});
      expect(exitCode).toBe(1);
    });

    it('should return numeric exit code directly', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => 42,
      });

      const exitCode = await command.run(mockCtx, [], {});
      expect(exitCode).toBe(42);
    });

    it('should handle synchronous handlers', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: () => ({ ok: true }),
      });

      const exitCode = await command.run(mockCtx, [], {});
      expect(exitCode).toBe(0);
    });
  });

  describe('Flag Validation', () => {
    it('should validate required flags', async () => {
      const handler = vi.fn().mockResolvedValue({ ok: true });

      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {
          name: { type: 'string', required: true },
        },
        handler,
      });

      const exitCode = await command.run(mockCtx, [], {});

      expect(exitCode).toBe(3); // EXIT_CODES.INVALID_FLAGS
      expect(handler).not.toHaveBeenCalled();
    });

    it('should pass validation when required flags provided', async () => {
      const handler = vi.fn().mockResolvedValue({ ok: true });

      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {
          name: { type: 'string', required: true },
        },
        handler,
      });

      const exitCode = await command.run(mockCtx, [], { name: 'test-value' });

      expect(exitCode).toBe(0);
      expect(handler).toHaveBeenCalledWith(
        expect.anything(),
        [],
        expect.objectContaining({ name: 'test-value' })
      );
    });

    it('should apply default values', async () => {
      const handler = vi.fn().mockResolvedValue({ ok: true });

      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {
          count: { type: 'number', default: 10 },
          verbose: { type: 'boolean', default: false },
        },
        handler,
      });

      await command.run(mockCtx, [], {});

      expect(handler).toHaveBeenCalledWith(
        expect.anything(),
        [],
        expect.objectContaining({ count: 10, verbose: false })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle handler errors', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => {
          throw new Error('Handler error');
        },
      });

      const exitCode = await command.run(mockCtx, [], {});

      expect(exitCode).toBe(1);
      expect(mockUI.error).toHaveBeenCalled();
    });

    it('should log errors to platform logger', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => {
          throw new Error('Handler error');
        },
      });

      await command.run(mockCtx, [], {});

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should output error in JSON mode', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler: async () => {
          throw new Error('Handler error');
        },
      });

      await command.run(mockCtx, [], { json: true });

      expect(mockUI.json).toHaveBeenCalled();
      const jsonCall = mockUI.json.mock.calls[0]?.[0];
      expect(jsonCall.ok).toBe(false);
      expect(jsonCall.error).toBe('Handler error');
    });
  });

  describe('Analytics Integration', () => {
    it('should accept analytics config (legacy)', async () => {
      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        analytics: {
          startEvent: 'TEST_STARTED',
          finishEvent: 'TEST_FINISHED',
          command: 'test-command',
        },
        handler: async () => ({ ok: true }),
      });

      const exitCode = await command.run(mockCtx, [], {});

      // Analytics is legacy - command should still work
      expect(exitCode).toBe(0);
    });
  });

  describe('Formatter', () => {
    it('should call formatter with result', async () => {
      const formatter = vi.fn();

      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {
          name: { type: 'string' },
        },
        handler: async () => ({ ok: true, message: 'success' }),
        formatter,
      });

      await command.run(mockCtx, [], { name: 'test' });

      // Formatter should be called with result, ctx, flags, argv
      expect(formatter).toHaveBeenCalled();
    });
  });

  // Removed: Tracker Integration - tracker is no longer added (pure PluginContextV3)
  describe('Tracker Integration (REMOVED)', () => {
    it('tracker is no longer added - context is pure PluginContextV3', async () => {
      const handler = vi.fn().mockImplementation((ctx) => {
        // Pure PluginContextV3 - no tracker field
        expect(ctx.tracker).toBeUndefined();
        return { ok: true };
      });

      const command = defineSystemCommand({
        name: 'test',
        description: 'Test',
        flags: {},
        handler,
      });

      await command.run(mockCtx, [], {});

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Logging', () => {
    it('should log command execution', async () => {
      const command = defineSystemCommand({
        name: 'test-cmd',
        description: 'Test',
        flags: {},
        handler: async () => ({ ok: true }),
      });

      await command.run(mockCtx, [], {});

      expect(mockLogger.info).toHaveBeenCalled();
      const calls = mockLogger.info.mock.calls;
      const hasStartLog = calls.some((call: any[]) => call[0]?.includes('started'));
      const hasCompleteLog = calls.some((call: any[]) => call[0]?.includes('completed'));
      expect(hasStartLog || hasCompleteLog).toBe(true);
    });
  });
});

describe('defineSystemCommandGroup', () => {
  it('should create a command group', () => {
    const cmd1 = defineSystemCommand({
      name: 'cmd1',
      description: 'Command 1',
      flags: {},
      handler: async () => ({ ok: true }),
    });

    const cmd2 = defineSystemCommand({
      name: 'cmd2',
      description: 'Command 2',
      flags: {},
      handler: async () => ({ ok: true }),
    });

    const group = defineSystemCommandGroup(
      'test-group',
      'Test command group',
      [cmd1, cmd2]
    );

    expect(group.name).toBe('test-group');
    expect(group.describe).toBe('Test command group');
    expect(group.commands).toHaveLength(2);
    expect(group.commands[0]!.name).toBe('cmd1');
    expect(group.commands[1]!.name).toBe('cmd2');
  });

  it('should handle empty command array', () => {
    const group = defineSystemCommandGroup(
      'empty-group',
      'Empty group',
      []
    );

    expect(group.commands).toHaveLength(0);
  });
});
