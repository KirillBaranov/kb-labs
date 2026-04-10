/**
 * @module @kb-labs/core-sandbox/cleanup/resource-tracker
 * Resource tracking for guaranteed cleanup
 */

/**
 * Resource tracker for temporary files and cleanup callbacks
 */
export class ResourceTracker {
  private tmpFiles: Set<string> = new Set();
  private cleanupCallbacks: Array<() => Promise<void>> = [];
  
  /**
   * Register a temporary file for cleanup
   */
  addTmpFile(path: string): void {
    this.tmpFiles.add(path);
  }
  
  /**
   * Register a cleanup callback
   */
  onCleanup(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }
  
  /**
   * Execute cleanup: remove tmp files and run callbacks
   */
  async cleanup(): Promise<void> {
    // Remove tmp files
    const fs = await import('fs/promises');
    await Promise.allSettled(
      Array.from(this.tmpFiles).map(file => 
        fs.unlink(file).catch(() => {
          // Ignore errors (file might not exist)
        })
      )
    );
    
    // Run cleanup callbacks
    await Promise.allSettled(
      this.cleanupCallbacks.map(cb => cb())
    );
    
    // Clear tracking
    this.tmpFiles.clear();
    this.cleanupCallbacks = [];
  }
}





