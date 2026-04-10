/**
 * Main entry point for medium project
 */

import { CoreService } from '@/services/core.js';
import { DataProcessor } from '@/services/processor.js';
import { ConfigManager } from '@/utils/config.js';

/**
 * Application class with multiple dependencies
 */
export class MediumApp {
  private coreService: CoreService;
  private processor: DataProcessor;
  private config: ConfigManager;

  constructor() {
    this.config = new ConfigManager();
    this.coreService = new CoreService(this.config);
    this.processor = new DataProcessor(this.coreService);
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    await this.config.load();
    await this.coreService.start();
    await this.processor.initialize();
  }

  /**
   * Process data using the processor
   */
  async processData(input: any[]): Promise<any[]> {
    return this.processor.process(input);
  }

  /**
   * Get application status
   */
  getStatus(): { running: boolean; config: any } {
    return {
      running: this.coreService.isRunning(),
      config: this.config.getConfig()
    };
  }
}

/**
 * Create and export app instance
 */
export const app = new MediumApp();

/**
 * Utility function using external dependency
 */
export async function processWithLodash<T>(items: T[]): Promise<T[]> {
  const _ = await import('lodash');
  return _.uniqBy(items, 'id');
}

