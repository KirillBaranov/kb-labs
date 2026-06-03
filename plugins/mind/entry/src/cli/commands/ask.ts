import { defineCommand, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { QueryRequestSchema, type AskFlags, type AgentResponse } from '@kb-labs/mind-contracts';
import { buildMind } from '../../platform';

type AskResult = { exitCode: number; result?: AgentResponse };

export default defineCommand<unknown, CLIInput<AskFlags>, AgentResponse>({
  id: 'mind:ask',
  description: 'Ask a question and get a grounded answer with citations',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<AskFlags>): Promise<AskResult> {
      const { flags } = input;
      // `--agent` == `--format json`: the machine-readable agent contract.
      const json = flags.agent || flags.format === 'json' || flags.json;
      try {
        const req = QueryRequestSchema.parse({
          text: flags.text,
          indexId: flags.index,
          mode: flags.mode,
          snippet: flags.snippet,
        });
        const mind = await buildMind(ctx.cwd);
        const res = await mind.ask(req);

        if (json) {
          // Single compact line so the agent contract `… --agent | grep "^{"` works
          // (ctx.ui.json pretty-prints, which breaks line-based extraction).
          console.log(JSON.stringify(res));
          return { exitCode: 0, result: res };
        }

        const head = res.abstained
          ? `⚠ low confidence (${res.confidence.toFixed(2)}) — answer may be unreliable`
          : `answer (confidence ${res.confidence.toFixed(2)})`;
        ctx.ui?.success?.(head, {
          sections: [
            { header: 'Answer', items: [res.answer] },
            {
              header: 'Sources',
              items: res.sources.map(
                (s) => `${s.file}:${s.lines[0]}-${s.lines[1]} [${s.matchedBy}${s.stale ? ', stale' : ''}]`,
              ),
            },
          ],
        });
        return { exitCode: 0, result: res };
      } catch (err) {
        handleError(ctx, err, json);
        return { exitCode: 1 };
      }
    },
  },
});
