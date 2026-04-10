/**
 * Utility helper functions
 */

export interface HelperConfig {
  maxRetries: number;
  timeout: number;
}

/**
 * Utility helper class
 */
export class UtilityHelper {
  private config: HelperConfig;

  constructor(config: HelperConfig = { maxRetries: 3, timeout: 5000 }) {
    this.config = config;
  }

  /**
   * Retry function with exponential backoff
   */
  async retry<T>(fn: () => Promise<T>, retries?: number): Promise<T> {
    const maxRetries = retries ?? this.config.maxRetries;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === maxRetries - 1) {throw error;}
        await this.delay(Math.pow(2, i) * 1000);
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate data structure
   */
  validateData(data: any): boolean {
    return data && typeof data === 'object' && data.id;
  }

  /**
   * Format data for output
   */
  formatData(data: any): string {
    return JSON.stringify(data, null, 2);
  }
}

