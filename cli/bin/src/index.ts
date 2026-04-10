import { executeCli } from "./runtime/bootstrap";

/**
 * CLI entry point.
 *
 * @param argv  Arguments, typically `process.argv.slice(2)`.
 * @param opts  Runtime options. The most important is `moduleUrl`, which
 *              should be `import.meta.url` of the CLI binary — it lets the
 *              platform-root resolver find `node_modules/@kb-labs/*` in
 *              installed mode without hardcoding directory levels.
 */
export async function run(
  argv: string[],
  opts: { moduleUrl?: string } = {},
): Promise<number | void> {
  return executeCli(argv, { moduleUrl: opts.moduleUrl });
}
