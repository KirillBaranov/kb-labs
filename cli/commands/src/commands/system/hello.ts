import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../utils/generate-examples.js';

type HelloFlags = {
  json: { type: 'boolean'; description?: string };
};

type HelloResult = CommandResult & {
  message: string;
};

export const hello = defineSystemCommand<HelloFlags, HelloResult>({
  name: 'hello',
  description: 'Print Hello World',
  longDescription: 'Prints "Hello World" — a simple smoke-test for CLI functionality',
  category: 'info',
  examples: generateExamples('hello', 'kb', [
    { flags: {} },
  ]),
  flags: {
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  analytics: {
    command: 'hello',
    startEvent: 'HELLO_STARTED',
    finishEvent: 'HELLO_FINISHED',
  },
  async handler(ctx, _argv, flags) {
    const message = 'Hello World';

    ctx.platform?.logger?.info('Hello command executed');

    if (!flags.json) {
      ctx.ui?.write(`${message}\n`);
    } else {
      ctx.ui?.json({ message, status: 'ready' });
    }

    return { ok: true, message };
  },
});
