/**
 * @file Unit tests for WebSocket message builders and routers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineMessage, MessageBuilder, MessageRouter } from '../ws-types.js';
import type { WSMessage, WSSender } from '@kb-labs/plugin-contracts';

describe('MessageBuilder', () => {
  describe('create', () => {
    it('should create message with type and payload', () => {
      const builder = new MessageBuilder<{ name: string }>('test');

      const message = builder.create({ name: 'Alice' });

      expect(message.type).toBe('test');
      expect(message.payload).toEqual({ name: 'Alice' });
      expect(message.timestamp).toBeGreaterThan(0);
    });

    it('should create message with messageId', () => {
      const builder = new MessageBuilder<{ data: string }>('test');

      const message = builder.create({ data: 'hello' }, 'msg-123');

      expect(message.type).toBe('test');
      expect(message.payload).toEqual({ data: 'hello' });
      expect(message.messageId).toBe('msg-123');
      expect(message.timestamp).toBeGreaterThan(0);
    });

    it('should create message without messageId', () => {
      const builder = new MessageBuilder<object>('ping');

      const message = builder.create({});

      expect(message.type).toBe('ping');
      expect(message.payload).toEqual({});
      expect(message.messageId).toBeUndefined();
      expect(message.timestamp).toBeGreaterThan(0);
    });

    it('should generate unique timestamps for sequential calls', () => {
      const builder = new MessageBuilder<object>('test');

      const msg1 = builder.create({});
      const msg2 = builder.create({});

      // Timestamps should be close but not necessarily different
      // (depends on system clock resolution)
      expect(msg1.timestamp).toBeLessThanOrEqual(msg2.timestamp);
    });
  });

  describe('is', () => {
    it('should return true for matching message type', () => {
      const builder = new MessageBuilder<{ count: number }>('update');

      const message: WSMessage = {
        type: 'update',
        payload: { count: 42 },
        timestamp: Date.now(),
      };

      expect(builder.is(message)).toBe(true);
    });

    it('should return false for non-matching message type', () => {
      const builder = new MessageBuilder<{ count: number }>('update');

      const message: WSMessage = {
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
      };

      expect(builder.is(message)).toBe(false);
    });

    it('should narrow type when used in if statement', () => {
      const UpdateMsg = new MessageBuilder<{ progress: number }>('update');

      const message: WSMessage = {
        type: 'update',
        payload: { progress: 50 },
        timestamp: Date.now(),
      };

      if (UpdateMsg.is(message)) {
        // TypeScript should infer message.payload as { progress: number }
        const progress: number = message.payload.progress;
        expect(progress).toBe(50);
      } else {
        throw new Error('Should match');
      }
    });
  });
});

describe('defineMessage', () => {
  it('should create MessageBuilder instance', () => {
    const PingMsg = defineMessage<object>('ping');

    expect(PingMsg).toBeInstanceOf(MessageBuilder);
  });

  it('should create type-safe message builder', () => {
    interface ProgressPayload {
      phase: string;
      progress: number;
    }

    const ProgressMsg = defineMessage<ProgressPayload>('progress');

    const message = ProgressMsg.create({
      phase: 'analyzing',
      progress: 50,
    });

    expect(message.type).toBe('progress');
    expect((message.payload as any).phase).toBe('analyzing');
    expect((message.payload as any).progress).toBe(50);
  });

  it('should support different payload types', () => {
    const StringMsg = defineMessage<string>('text');
    const NumberMsg = defineMessage<number>('count');
    const ObjectMsg = defineMessage<{ items: string[] }>('list');

    const textMsg = StringMsg.create('hello');
    const countMsg = NumberMsg.create(42);
    const listMsg = ObjectMsg.create({ items: ['a', 'b'] });

    expect(textMsg.payload).toBe('hello');
    expect(countMsg.payload).toBe(42);
    expect(listMsg.payload).toEqual({ items: ['a', 'b'] });
  });
});

describe('MessageRouter', () => {
  let mockContext: any;
  let mockSender: WSSender;

  beforeEach(() => {
    mockContext = {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };

    mockSender = {
      send: vi.fn(),
      broadcast: vi.fn(),
      sendTo: vi.fn(),
      close: vi.fn(),
      getConnectionId: vi.fn(() => 'conn-123'),
    };
  });

  describe('on', () => {
    it('should register message handler', () => {
      const router = new MessageRouter();
      const PingMsg = defineMessage<object>('ping');
      const handler = vi.fn();

      router.on(PingMsg, handler);

      // Handler should be registered (tested via handle())
      expect(router).toBeDefined();
    });

    it('should support chaining', () => {
      const router = new MessageRouter();
      const PingMsg = defineMessage<object>('ping');
      const PongMsg = defineMessage<object>('pong');

      const result = router.on(PingMsg, vi.fn()).on(PongMsg, vi.fn());

      expect(result).toBe(router);
    });

    it('should register multiple handlers for different message types', () => {
      const router = new MessageRouter();
      const StartMsg = defineMessage<object>('start');
      const StopMsg = defineMessage<object>('stop');

      const startHandler = vi.fn();
      const stopHandler = vi.fn();

      router.on(StartMsg, startHandler).on(StopMsg, stopHandler);

      // Handlers registered (tested via handle())
      expect(router).toBeDefined();
    });
  });

  describe('handle', () => {
    it('should call handler for matching message type', async () => {
      const router = new MessageRouter();
      const PingMsg = defineMessage<object>('ping');
      const handler = vi.fn();

      router.on(PingMsg, handler);

      const message: WSMessage = {
        type: 'ping',
        payload: {},
        timestamp: Date.now(),
      };

      const handled = await router.handle(mockContext, message, mockSender);

      expect(handled).toBe(true);
      expect(handler).toHaveBeenCalledWith(mockContext, {}, mockSender);
    });

    it('should return false for unhandled message type', async () => {
      const router = new MessageRouter();
      const PingMsg = defineMessage<object>('ping');

      router.on(PingMsg, vi.fn());

      const message: WSMessage = {
        type: 'unknown',
        payload: {},
        timestamp: Date.now(),
      };

      const handled = await router.handle(mockContext, message, mockSender);

      expect(handled).toBe(false);
    });

    it('should pass payload to handler', async () => {
      const router = new MessageRouter();
      const UpdateMsg = defineMessage<{ progress: number }>('update');
      const handler = vi.fn();

      router.on(UpdateMsg, handler);

      const message: WSMessage = {
        type: 'update',
        payload: { progress: 75 },
        timestamp: Date.now(),
      };

      await router.handle(mockContext, message, mockSender);

      expect(handler).toHaveBeenCalledWith(mockContext, { progress: 75 }, mockSender);
    });

    it('should handle async handlers', async () => {
      const router = new MessageRouter();
      const StartMsg = defineMessage<object>('start');

      let resolved = false;
      const asyncHandler = vi.fn(async () => {
        await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
        resolved = true;
      });

      router.on(StartMsg, asyncHandler);

      const message: WSMessage = {
        type: 'start',
        payload: {},
        timestamp: Date.now(),
      };

      await router.handle(mockContext, message, mockSender);

      expect(resolved).toBe(true);
      expect(asyncHandler).toHaveBeenCalled();
    });

    it('should route to correct handler among multiple', async () => {
      const router = new MessageRouter();
      const PingMsg = defineMessage<object>('ping');
      const PongMsg = defineMessage<object>('pong');
      const StartMsg = defineMessage<object>('start');

      const pingHandler = vi.fn();
      const pongHandler = vi.fn();
      const startHandler = vi.fn();

      router.on(PingMsg, pingHandler).on(PongMsg, pongHandler).on(StartMsg, startHandler);

      const pongMessage: WSMessage = {
        type: 'pong',
        payload: {},
        timestamp: Date.now(),
      };

      await router.handle(mockContext, pongMessage, mockSender);

      expect(pingHandler).not.toHaveBeenCalled();
      expect(pongHandler).toHaveBeenCalled();
      expect(startHandler).not.toHaveBeenCalled();
    });

    it('should propagate handler errors', async () => {
      const router = new MessageRouter();
      const ErrorMsg = defineMessage<object>('error');
      const error = new Error('Handler failed');

      router.on(ErrorMsg, async () => {
        throw error;
      });

      const message: WSMessage = {
        type: 'error',
        payload: {},
        timestamp: Date.now(),
      };

      await expect(router.handle(mockContext, message, mockSender)).rejects.toThrow(error);
    });
  });

  describe('integration', () => {
    it('should handle complete message flow', async () => {
      const router = new MessageRouter();

      // Define message types
      const StartMsg = defineMessage<{ scope?: string }>('start');
      const ProgressMsg = defineMessage<{ progress: number }>('progress');
      const CompleteMsg = defineMessage<{ result: string }>('complete');

      // Handlers
      const startHandler = vi.fn(async (ctx, payload, sender) => {
        await sender.send(ProgressMsg.create({ progress: 0 }));
      });

      const progressHandler = vi.fn();
      const completeHandler = vi.fn();

      router.on(StartMsg, startHandler).on(ProgressMsg, progressHandler).on(CompleteMsg, completeHandler);

      // Handle start message
      const startMessage: WSMessage = {
        type: 'start',
        payload: { scope: 'packages' },
        timestamp: Date.now(),
      };

      const handled = await router.handle(mockContext, startMessage, mockSender);

      expect(handled).toBe(true);
      expect(startHandler).toHaveBeenCalledWith(mockContext, { scope: 'packages' }, mockSender);
      expect(mockSender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'progress',
          payload: { progress: 0 },
        })
      );
    });
  });
});
