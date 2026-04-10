import { describe, it, expect } from 'vitest';
import { MarkdownChunker } from '../markdown';

describe('MarkdownChunker', () => {
  const chunker = new MarkdownChunker();

  it('should have correct id and extensions', () => {
    expect(chunker.id).toBe('markdown-structure');
    expect(chunker.extensions).toContain('.md');
    expect(chunker.extensions).toContain('.markdown');
  });

  it('should chunk markdown by headings', () => {
    const markdown = `# Title 1

Content under title 1.

## Subtitle 1.1

Content under subtitle.

## Subtitle 1.2

More content.
`;

    const chunks = chunker.chunk(markdown, 'test.md', {
      byHeadings: true,
      minLines: 1, // Lower minLines to allow smaller chunks
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.type).toBe('markdown-heading');
  });

  it('should extract code blocks', () => {
    const markdown = `# Example

Here's some code:

\`\`\`typescript
function test() {
  return true;
}
\`\`\`

More text.
`;

    const chunks = chunker.chunk(markdown, 'test.md', {
      byHeadings: true,
      includeCodeBlocks: true,
    });

    // Should have chunks with code blocks
    const hasCodeBlock = chunks.some(chunk => 
      chunk.text.includes('function test()')
    );
    expect(hasCodeBlock).toBe(true);
  });

  it('should handle empty markdown', () => {
    const chunks = chunker.chunk('', 'test.md');
    expect(chunks).toEqual([]);
  });

  it('should handle markdown without headings', () => {
    const markdown = Array.from({ length: 50 }, (_, i) => `Line ${i + 1} with some content.`).join('\n');

    const chunks = chunker.chunk(markdown, 'test.md', {
      byHeadings: true,
      minLines: 30,
    });

    // Should fallback to line-based chunking or create chunks
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should preserve heading hierarchy', () => {
    const markdown = `# Level 1

Content 1.

## Level 2

Content 2.

### Level 3

Content 3.
`;

    const chunks = chunker.chunk(markdown, 'test.md', {
      byHeadings: true,
      minLines: 1, // Lower minLines to allow smaller chunks
    });

    // Should create chunks for headings
    expect(chunks.length).toBeGreaterThan(0);
    // Check that chunks have metadata with level information
    const hasLevelInfo = chunks.some(chunk => 
      chunk.metadata?.headingLevel !== undefined || chunk.metadata?.headingTitle !== undefined
    );
    expect(hasLevelInfo).toBe(true);
  });

  it('should respect maxLines option', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join('\n');
    const markdown = `# Title\n\n${lines}`;

    const chunks = chunker.chunk(markdown, 'test.md', {
      byHeadings: false,
      maxLines: 50,
    });

    chunks.forEach(chunk => {
      const chunkLines = chunk.text.split('\n').length;
      expect(chunkLines).toBeLessThanOrEqual(50);
    });
  });
});

