/**
 * Timing tracker utility for CLI commands
 * Provides checkpoint-based timing measurement
 */

export class TimingTracker {
  private start: number;
  private checkpoints: Record<string, number> = {};
  
  constructor() {
    this.start = Date.now();
  }
  
  /**
   * Record a timing checkpoint
   */
  checkpoint(name: string): void {
    this.checkpoints[name] = Date.now() - this.start;
  }
  
  /**
   * Get total elapsed time in milliseconds
   */
  total(): number {
    return Date.now() - this.start;
  }
  
  /**
   * Get timing breakdown including total
   */
  breakdown(): Record<string, number> {
    return { ...this.checkpoints, total: this.total() };
  }
  
  /**
   * Get timing breakdown without total
   */
  checkpointsOnly(): Record<string, number> {
    return { ...this.checkpoints };
  }
  
  /**
   * Reset the timer
   */
  reset(): void {
    this.start = Date.now();
    this.checkpoints = {};
  }
  
  /**
   * Get elapsed time since last checkpoint or start
   */
  sinceLastCheckpoint(): number {
    const lastCheckpointTime = Math.max(...Object.values(this.checkpoints), 0);
    return Date.now() - this.start - lastCheckpointTime;
  }
  
  /**
   * Get elapsed time since a specific checkpoint
   */
  sinceCheckpoint(checkpointName: string): number | null {
    const checkpointTime = this.checkpoints[checkpointName];
    if (checkpointTime === undefined) {
      return null;
    }
    return Date.now() - this.start - checkpointTime;
  }
}
