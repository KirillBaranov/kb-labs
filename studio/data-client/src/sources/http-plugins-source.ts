/**
 * HTTP implementation of PluginsDataSource
 */

import type { HttpClient } from '../client/http-client';
import type {
  PluginsDataSource,
  PluginsRegistryResponse,
  PluginAskRequest,
  PluginAskResponse
} from './plugins-source';

export class HttpPluginsSource implements PluginsDataSource {
  constructor(private readonly client: HttpClient) {}

  async getPlugins(): Promise<PluginsRegistryResponse> {
    return this.client.fetch<PluginsRegistryResponse>('/plugins/registry');
  }

  async askAboutPlugin(pluginId: string, request: PluginAskRequest): Promise<PluginAskResponse> {
    return this.client.fetch<PluginAskResponse>(`/plugins/${encodeURIComponent(pluginId)}/ask`, {
      method: 'POST',
      data: request,
    });
  }
}
