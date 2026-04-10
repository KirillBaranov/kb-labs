import type { AiAssistantDataSource } from './sources/ai-assistant-source';
import { MockAiAssistantSource } from './mocks/mock-ai-assistant-source';
import { HttpAiAssistantSource } from './http/http-ai-assistant-source';

export interface WebDataSourcesConfig {
  mode: 'mock' | 'http';
  baseUrl?: string;
}

export interface WebDataSources {
  aiAssistant: AiAssistantDataSource;
}

export function createWebDataSources(config: WebDataSourcesConfig): WebDataSources {
  if (config.mode === 'mock') {
    return { aiAssistant: new MockAiAssistantSource() };
  }

  return { aiAssistant: new HttpAiAssistantSource(config.baseUrl) };
}
