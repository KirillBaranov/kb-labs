/**
 * Core service implementation
 */

import type { ConfigManager } from '@/utils/config';

export interface ServiceConfig {
  timeout: number;
  retries: number;
  debug: boolean;
}

/**
 * Core service class
 */
export class CoreService {
  private config: ConfigManager;
  private running: boolean = false;

  constructor(config: ConfigManager) {
    this.config = config;
  }

  /**
   * Start the core service
   */
  async start(): Promise<void> {
    const config = this.config.getConfig();
    this.running = true;
    
    if (config.debug) {
      console.log('Core service started');
    }
  }

  /**
   * Stop the core service
   */
  async stop(): Promise<void> {
    this.running = false;
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Process core operations
   */
  async processCore(data: any): Promise<any> {
    if (!this.running) {
      throw new Error('Service not running');
    }
    
    return { processed: true, data };
  }
}

