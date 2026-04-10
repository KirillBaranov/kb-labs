import type { AiAssistantDataSource, ChatMessage } from '../sources/ai-assistant-source';
import { MockAiAssistantSource } from '../mocks/mock-ai-assistant-source';

export class HttpAiAssistantSource implements AiAssistantDataSource {
  private fallback = new MockAiAssistantSource();

  constructor(private baseUrl: string = '') {}

  async sendMessage(message: string, locale: string, history: ChatMessage[]): Promise<ChatMessage> {
    if (!this.baseUrl) {
      return this.fallback.sendMessage(message, locale, history);
    }

    const res = await fetch(`${this.baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, locale, history }),
    });

    if (!res.ok) throw new Error(`AI API error: ${res.status}`);
    return res.json();
  }

  getSuggestedQuestions(locale: string): string[] {
    return this.fallback.getSuggestedQuestions(locale);
  }
}
