/**
 * Configuration manager
 */

export interface AppConfig {
  timeout: number;
  retries: number;
  debug: boolean;
  apiUrl: string;
}

/**
 * Configuration manager class
 */
export class ConfigManager {
  private config: AppConfig;
  private loaded: boolean = false;

  constructor() {
    this.config = {
      timeout: 5000,
      retries: 3,
      debug: false,
      apiUrl: 'https://api.example.com'
    };
  }

  /**
   * Load configuration
   */
  async load(): Promise<void> {
    // Simulate async config loading
    await new Promise(resolve => setTimeout(resolve, 100));
    this.loaded = true;
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Check if config is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = {
      timeout: 5000,
      retries: 3,
      debug: false,
      apiUrl: 'https://api.example.com'
    };
    this.loaded = false;
  }
}

