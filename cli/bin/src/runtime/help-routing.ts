import type { RegisteredCommand } from "@kb-labs/cli-commands";

/**
 * A command can also be a namespace for more specific commands.
 * In that case `--help` should describe the namespace, while execution of the
 * command without `--help` must still use the exact command.
 */
export function hasNestedCommands(
  commandSegments: readonly string[],
  commands: readonly RegisteredCommand[],
): boolean {
  return commands.some((candidate) => {
    const candidateSegments = candidate.manifest.segments;
    return (
      candidateSegments.length > commandSegments.length &&
      commandSegments.every(
        (segment, index) => candidateSegments[index] === segment,
      )
    );
  });
}
