/**
 * @module @kb-labs/adapters-kblabs-gateway/llm
 *
 * KB Labs Gateway LLM adapter.
 *
 * Implements ILLM against the KB Labs Gateway OpenAI-compatible endpoint:
 *   POST <gatewayURL>/llm/v1/chat/completions
 *
 * Authentication: machine identity (clientId + clientSecret) obtained via
 * kb-create --demo. The adapter automatically refreshes the short-lived
 * JWT access token (~15 min) before each request using the stored credentials.
 */

import OpenAI from "openai";
import type {
  ILLM,
  LLMOptions,
  LLMResponse,
  LLMMessage,
  LLMToolCallOptions,
  LLMToolCallResponse,
  LLMTool,
  LLMToolCall,
  LLMProtocolCapabilities,
} from "@kb-labs/core-platform";

// ── Config ───────────────────────────────────────────────────────────────────

export interface KBLabsGatewayLLMConfig {
  /** KB Labs Gateway base URL. Defaults to https://api.kblabs.ru */
  gatewayURL?: string;
  /**
   * Machine identity credentials for automatic JWT token refresh.
   * Populated by kb-create --demo. Replace with your own API key
   * by removing these fields and setting apiKey instead.
   */
  kbClientId?: string;
  kbClientSecret?: string;
  /**
   * Static access token. Used directly if kbClientId/kbClientSecret are absent.
   * Falls back to KB_LABS_API_KEY or OPENAI_API_KEY env vars.
   */
  apiKey?: string;
  /** Default model tier. Values: "small" | "medium" | "large". */
  defaultModel?: string;
  /** Default max output tokens. Overrides the API default (4096). */
  defaultMaxTokens?: number;
}

const DEFAULT_GATEWAY_URL = "https://api.kblabs.ru";
const DEFAULT_MAX_TOKENS = 16_384;

// ── Token refresh ─────────────────────────────────────────────────────────────

/** Decode JWT exp claim. Returns 0 on parse failure. */
function jwtExp(token: string): number {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const data = JSON.parse(json) as { exp?: number };
    return typeof data.exp === "number" ? data.exp : 0;
  } catch {
    return 0;
  }
}

/** Returns true if token is absent or expires within the next 60 seconds. */
function tokenExpired(token: string | undefined): boolean {
  if (!token) {return true;}
  return jwtExp(token) < Math.floor(Date.now() / 1000) + 60;
}

/** Exchange clientId/clientSecret for a fresh accessToken. */
async function refreshToken(
  gatewayURL: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(`${gatewayURL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) {
    throw new Error(`KB Labs Gateway token refresh failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { accessToken: string };
  if (!data.accessToken) {
    throw new Error("KB Labs Gateway token refresh: empty accessToken in response");
  }
  return data.accessToken;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class KBLabsGatewayLLM implements ILLM {
  private readonly gatewayURL: string;
  private readonly kbClientId?: string;
  private readonly kbClientSecret?: string;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  private accessToken?: string;
  private client: OpenAI;

  constructor(config: KBLabsGatewayLLMConfig = {}) {
    this.gatewayURL = config.gatewayURL ?? DEFAULT_GATEWAY_URL;
    this.kbClientId = config.kbClientId;
    this.kbClientSecret = config.kbClientSecret;
    this.defaultModel = config.defaultModel ?? "small";
    this.defaultMaxTokens = config.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;

    const initialKey =
      config.apiKey ?? process.env.KB_LABS_API_KEY ?? process.env.OPENAI_API_KEY ?? "pending";

    this.client = new OpenAI({
      apiKey: initialKey,
      baseURL: `${this.gatewayURL}/llm`,
    });
  }

  getProtocolCapabilities(): LLMProtocolCapabilities {
    return {
      cache: { supported: false },
      stream: { supported: false },
    };
  }

  private async ensureToken(): Promise<void> {
    if (!this.kbClientId || !this.kbClientSecret) {return;}
    if (!tokenExpired(this.accessToken)) {return;}

    this.accessToken = await refreshToken(
      this.gatewayURL,
      this.kbClientId,
      this.kbClientSecret,
    );
    this.client = new OpenAI({
      apiKey: this.accessToken,
      baseURL: `${this.gatewayURL}/llm`,
    });
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    await this.ensureToken();
    const model = options?.model ?? this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      messages: [{ role: "user", content: prompt }],
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    });

    const content = response.choices[0]?.message?.content ?? "";
    return {
      content,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  async *stream(prompt: string, options?: LLMOptions): AsyncIterable<string> {
    const response = await this.complete(prompt, options);
    yield response.content;
  }

  async chatWithTools(
    messages: LLMMessage[],
    options: LLMToolCallOptions,
  ): Promise<LLMToolCallResponse> {
    await this.ensureToken();
    const model = options?.model ?? this.defaultModel;

    const openaiMessages = messages.map((m) => this.toOpenAIMessage(m));

    const tools: OpenAI.Chat.ChatCompletionTool[] = options.tools.map((t: LLMTool) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema as Record<string, unknown>,
      },
    }));

    const response = await this.client.chat.completions.create({
      model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      messages: openaiMessages,
      tools: options.toolChoice !== "none" ? tools : undefined,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return { content: "", toolCalls: [], usage: { promptTokens: 0, completionTokens: 0 }, model: "" };
    }

    const toolCalls: LLMToolCall[] = (message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
    }));

    return {
      content: message.content ?? "",
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
      model: response.model,
    };
  }

  private toOpenAIMessage(m: LLMMessage): OpenAI.Chat.ChatCompletionMessageParam {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId ?? "",
        content: m.content,
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content ?? null,
        tool_calls: m.toolCalls.map((tc: LLMToolCall) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        })),
      };
    }
    return {
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    };
  }
}

export function createAdapter(config?: KBLabsGatewayLLMConfig): KBLabsGatewayLLM {
  return new KBLabsGatewayLLM(config);
}

export default createAdapter;
