/**
 * Prompts for Query Decomposition
 */

export const DECOMPOSE_SYSTEM_PROMPT = `You are a search query decomposer for a codebase search system.
Your job is to break down complex questions into simpler, more specific search queries.

Guidelines:
- Break complex questions into 2-5 focused sub-queries
- Each sub-query should target a specific aspect of the question
- Use technical terms that would appear in code (class names, function names, etc.)
- For simple questions (like "where is X?"), return just the original query
- Focus on finding: definitions, implementations, usages, configurations`;

export const DECOMPOSE_PROMPT_TEMPLATE = `Break down this question into specific search queries for a codebase:

Question: "{query}"

Return a JSON object with this structure:
{
  "subqueries": ["query1", "query2", ...],
  "reasoning": "brief explanation of decomposition"
}

If the question is simple and doesn't need decomposition, return just the original query.
Return 1-5 subqueries depending on complexity.`;

export const COMPLEXITY_SYSTEM_PROMPT = `You analyze questions about code to determine their complexity.
Simple: Location/definition questions ("where is X?", "what is Y?")
Medium: Implementation questions ("how does X work?")
Complex: Architecture/relationship questions ("how are X and Y connected?", "explain the flow of...")`;

export const COMPLEXITY_PROMPT_TEMPLATE = `Analyze the complexity of this codebase question:

Question: "{query}"

Return JSON:
{
  "level": "simple" | "medium" | "complex",
  "reason": "one sentence explanation"
}`;
