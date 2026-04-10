import { describe, expect, it } from 'vitest';

describe('core-contracts export surface snapshot', () => {
  it('matches entrypoint export keys', () => {
    const expectedSurface = [
      'ArtifactsConfig',
      'CANONICAL_OBSERVABILITY_METRICS',
      'ExecuteOptions',
      'ExecutionDescriptorCore',
      'ExecutionError',
      'ExecutionErrorCode',
      'ExecutionMeta',
      'ExecutionMetadata',
      'ExecutionRequest',
      'ExecutionResponse',
      'ExecutionResult',
      'ExecutionStats',
      'ExecutionTarget',
      'HealthStatus',
      'IExecutionBackend',
      'IPlatformGateway',
      'ISubprocessRunner',
      'OBSERVABILITY_CAPABILITIES',
      'OBSERVABILITY_CONTRACT_VERSION',
      'OBSERVABILITY_SCHEMA',
      'RunResult',
      'WorkspaceConfig',
    ].sort();

    expect(expectedSurface).toMatchInlineSnapshot(`
      [
        "ArtifactsConfig",
        "CANONICAL_OBSERVABILITY_METRICS",
        "ExecuteOptions",
        "ExecutionDescriptorCore",
        "ExecutionError",
        "ExecutionErrorCode",
        "ExecutionMeta",
        "ExecutionMetadata",
        "ExecutionRequest",
        "ExecutionResponse",
        "ExecutionResult",
        "ExecutionStats",
        "ExecutionTarget",
        "HealthStatus",
        "IExecutionBackend",
        "IPlatformGateway",
        "ISubprocessRunner",
        "OBSERVABILITY_CAPABILITIES",
        "OBSERVABILITY_CONTRACT_VERSION",
        "OBSERVABILITY_SCHEMA",
        "RunResult",
        "WorkspaceConfig",
      ]
    `);
  });
});
