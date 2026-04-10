export function getExitCode(result: unknown): number {
  if (typeof result === 'number') {
    return result;
  }

  if (result && typeof result === 'object' && 'exitCode' in result) {
    const exitCode = (result as { exitCode?: unknown }).exitCode;
    if (typeof exitCode === 'number') {
      return exitCode;
    }
  }

  return 0;
}

export function getProducedArtifacts(result: unknown): string[] {
  if (result && typeof result === 'object' && 'produces' in result) {
    const produces = (result as { produces?: unknown }).produces;
    if (Array.isArray(produces)) {
      return produces.filter((item): item is string => typeof item === 'string');
    }
  }

  return [];
}
