export type ArtifactKind = 'file' | 'json' | 'markdown' | 'binary' | 'dir' | 'log';

export interface ArtifactExample {
  summary?: string;
  payload?: unknown;
}

export interface PluginArtifactContract {
  id: string;
  kind: ArtifactKind;
  description?: string;
  /**
   * Relative path or glob pattern describing where the artifact is produced.
   */
  pathPattern?: string;
  /**
   * IANA media type describing the artifact (for example: application/json).
   */
  mediaType?: string;
  /**
   * Reference to a schema describing the artifact payload. Can be a URI or package export.
   */
  schemaRef?: string;
  /**
   * Optional example payload to support documentation and tooling.
   */
  example?: ArtifactExample;
}

export type ArtifactContractsMap = Record<string, PluginArtifactContract>;
