/**
 * HyDE — Hypothetical Document Embeddings
 *
 * For technical lookup queries, generate a hypothetical code snippet that would
 * answer the question if found in the codebase. Embedding the snippet instead of
 * the NL query bridges the vocabulary gap between natural language and source code.
 */

import type { ILLM } from '@kb-labs/sdk';

const HYDE_SYSTEM = `You are a code oracle. Given a technical question about a codebase, write a short realistic code snippet (5-15 lines) that would answer the question if found in the source.
Write only code. No explanation, no markdown fences, no placeholders. Use realistic identifier names.`;

const HYDE_TEMPLATE = `Question: "{query}"

Write the exact function, class body, or code block that would implement or demonstrate what is being asked. Use realistic variable and function names as they would appear in production code.`;

/**
 * Generate a hypothetical code snippet for a technical subquery.
 * Returns null on failure — callers should fall back to the original query text.
 */
export async function generateHypotheticalSnippet(
  llm: ILLM,
  subquery: string,
): Promise<string | null> {
  try {
    const result = await llm.complete(
      HYDE_TEMPLATE.replace('{query}', subquery),
      {
        systemPrompt: HYDE_SYSTEM,
        maxTokens: 300,
        temperature: 0.1,
      },
    );

    const code = result.content.trim();
    // Sanity check: must contain at least one identifier-like token
    if (code.length < 20 || !/\w{3,}/.test(code)) {return null;}
    return code;
  } catch {
    return null;
  }
}
