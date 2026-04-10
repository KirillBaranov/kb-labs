/**
 * @module @kb-labs/core-sandbox/types/lifecycle-hooks
 * Lifecycle hooks for observability and extensions
 */

/**
 * Lifecycle hooks for observability and extensions
 */
export interface LifecycleHooks {
  /** Called when execution starts */
  onStart?: () => void | Promise<void>;
  
  /** Called with progress updates (0-100) */
  onProgress?: (progress: number, message?: string) => void | Promise<void>;
  
  /** Called when execution completes successfully */
  onComplete?: (result: any) => void | Promise<void>;
  
  /** Called when execution fails */
  onError?: (error: Error) => void | Promise<void>;
  
  /** Called when execution is cancelled */
  onCancel?: () => void | Promise<void>;
}





