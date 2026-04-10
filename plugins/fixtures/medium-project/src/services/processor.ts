/**
 * Data processor service
 */

import type { CoreService } from './core';

export interface ProcessedData {
  id: string;
  processed: boolean;
  timestamp: number;
}

/**
 * Data processor class
 */
export class DataProcessor {
  private coreService: CoreService;
  private initialized: boolean = false;

  constructor(coreService: CoreService) {
    this.coreService = coreService;
  }

  /**
   * Initialize the processor
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Process array of data
   */
  async process(data: any[]): Promise<ProcessedData[]> {
    if (!this.initialized) {
      throw new Error('Processor not initialized');
    }

    const results: ProcessedData[] = [];
    
    for (const item of data) {
      const processed = await this.coreService.processCore(item);
      results.push({
        id: item.id || Math.random().toString(),
        processed: processed.processed,
        timestamp: Date.now()
      });
    }

    return results;
  }

  /**
   * Get processor status
   */
  getStatus(): { initialized: boolean; coreRunning: boolean } {
    return {
      initialized: this.initialized,
      coreRunning: this.coreService.isRunning()
    };
  }
}

