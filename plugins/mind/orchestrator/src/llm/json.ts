import type { ILLM } from '@kb-labs/sdk';

export interface LLMJSONOptions<T> {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  schema?: {
    name: string;
    description?: string;
    strict?: boolean;
  };
}

export async function completeJSON<T>(llm: ILLM, options: LLMJSONOptions<T>): Promise<T> {
  const jsonInstructions = `
IMPORTANT: Respond with valid JSON only. No markdown, no code blocks, just raw JSON.
Do not include any text before or after the JSON object.
`;

  const systemPrompt = options.systemPrompt
    ? `${options.systemPrompt}\n\n${jsonInstructions}`
    : jsonInstructions;

  const result = await llm.complete(options.prompt, {
    systemPrompt,
    maxTokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.1,
  });

  const text = result.content.trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim()) as T;
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]) as T;
    }

    throw new Error(`Failed to parse JSON from LLM response: ${text.slice(0, 200)}...`);
  }
}
