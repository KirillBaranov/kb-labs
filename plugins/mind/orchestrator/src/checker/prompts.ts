/**
 * Prompts for Completeness Checking
 */

export const COMPLETENESS_SYSTEM_PROMPT = `You are an expert code analyst checking if provided code context is sufficient to answer a question.
Be strict but fair - if the core information is present, mark as complete even if some minor details are missing.`;

export const COMPLETENESS_PROMPT_TEMPLATE = `Question: "{query}"

Code context provided:
{chunks_summary}

Is this context sufficient to fully answer the question?

Return JSON:
{
  "complete": true/false,
  "confidence": 0.0-1.0 (how confident you are in the answer based on this context),
  "missing": ["list of missing information if not complete"],
  "suggestSources": [
    {
      "source": "source type (jira, confluence, code)",
      "reason": "why this source might help",
      "query": "suggested search query"
    }
  ]
}

Guidelines:
- confidence 0.8+ = high quality answer possible
- confidence 0.5-0.8 = partial answer, some gaps
- confidence < 0.5 = insufficient for meaningful answer
- missing should be specific (e.g., "error handling logic", not just "more code")`;
