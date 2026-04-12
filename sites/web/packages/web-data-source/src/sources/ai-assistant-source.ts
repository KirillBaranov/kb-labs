export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  links?: Array<{ title: string; href: string }>;
}

export interface AiAssistantDataSource {
  sendMessage(message: string, locale: string, history: ChatMessage[]): Promise<ChatMessage>;
  getSuggestedQuestions(locale: string): string[];
}
