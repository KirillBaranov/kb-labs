/**
 * Prompts for Response Synthesis
 *
 * Grounded prompts that enforce factual, source-based answers.
 * Key anti-hallucination measure.
 */

export const SYNTHESIS_SYSTEM_PROMPT = `You are a code search assistant providing ONLY factual, source-based answers.

CRITICAL RULES - NEVER VIOLATE:
1. ONLY mention code, files, functions, or parameters that appear in the provided sources
2. NEVER invent, assume, or hallucinate field names, parameters, or file paths
3. If information is not in sources, say "Not found in provided sources"
4. Every technical claim MUST be backed by a [source:N] reference
5. Quote exact code when possible, don't paraphrase technical details

Language: Match the question language (Russian for Russian questions, English for English).`;

export const SYNTHESIS_PROMPT_TEMPLATE = `Answer this question using ONLY the provided sources: "{query}"

SOURCES (TOON format - compact notation):
{chunks}

NOTE: Sources are in TOON format:
- Header: [count]{fields}: shows number of sources and field names
- Rows: comma-separated values for each source
- Fields: id, path, lines, score, text (code snippet)

STRICT REQUIREMENTS:
1. Only reference files, functions, parameters that appear EXACTLY in sources above
2. Include [source:N] reference for every claim (N = id from TOON table)
3. If sources don't contain the answer, say "Based on available sources, this information was not found"
4. Do NOT mention any fields/parameters unless you can see them in the source code
5. When mentioning a parameter, quote the exact line where it appears

Return JSON:
{
  "answer": "your answer with [source:N] references for every claim",
  "sources": [
    {
      "file": "exact path from source above",
      "lines": [startLine, endLine],
      "snippet": "exact code from source (max 5 lines)",
      "relevance": "why this source supports your answer",
      "kind": "code|doc|adr|config|external"
    }
  ],
  "confidence": 0.0-1.0,
  "complete": true/false,
  "suggestions": [
    {
      "type": "adr|repo|doc|file|next-question",
      "label": "suggestion text",
      "ref": "reference"
    }
  ]
}

CONFIDENCE GUIDE:
- 1.0: Answer fully supported by sources with exact quotes
- 0.7-0.9: Answer supported but some inference needed
- 0.4-0.6: Partial answer, missing some information
- 0.0-0.3: Sources don't adequately answer the question`;

export const INSTANT_SYNTHESIS_TEMPLATE = `Question: "{query}"

Code matches (TOON format):
{chunks}

NOTE: Sources in compact TOON format - [count]{fields}: rows of values

Return brief JSON (only use info from code above):
{
  "answer": "brief factual answer (1-2 sentences, only from sources)",
  "confidence": 0.0-1.0
}`;

/**
 * Structured synthesis prompt that separates source types
 * For thinking mode with better source organization
 */
export const STRUCTURED_SYNTHESIS_PROMPT = `Answer this question using ONLY the categorized sources below: "{query}"

{categorized_sources}

STRICT RULES:
1. Separate your answer by source type:
   - "According to ADRs:" (architectural decisions)
   - "In the code:" (implementation details)
   - "Documentation states:" (from .md files)
2. Every claim needs [source:N] reference
3. NEVER mention parameters/fields not visible in sources
4. If you're unsure, say "Not clearly specified in sources"

Return JSON:
{
  "answer": "structured answer with sections and [source:N] refs",
  "sources": [...],
  "confidence": 0.0-1.0,
  "complete": true/false,
  "suggestions": [...]
}`;
