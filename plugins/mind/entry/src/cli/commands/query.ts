import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { QueryRequestSchema, type QueryFlags } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

export default defineCommand<unknown, CLIInput<QueryFlags>, { exitCode: number }>({
  id: 'mind:query',
  description: 'Ask a question and get an agent answer (agent-response-v1)',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<QueryFlags>): Promise<{ exitCode: number }> {
      const { flags } = input;
      const req = QueryRequestSchema.parse({ text: flags.text, indexId: flags.index, mode: flags.mode });
      const mind = await buildMind(ctx.cwd);
      const res = await mind.ask(req);

      // Emit the frozen agent JSON as the single stdout line.
      ctx.ui?.json?.(res);
      return { exitCode: 0 };
    },
  },
});
