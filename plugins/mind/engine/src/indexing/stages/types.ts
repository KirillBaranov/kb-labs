export interface MindChunk {
  chunkId: string;
  sourceId: string;
  path: string;
  span: { startLine: number; endLine: number };
  text: string;
  metadata: Record<string, unknown>;
  hash?: string;
  mtime?: number;
}
