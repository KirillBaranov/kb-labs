/**
 * Type definitions for the sample project
 */

/**
 * User interface
 */
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

/**
 * Configuration options
 */
export interface Config {
  apiUrl: string;
  timeout: number;
  retries: number;
}

/**
 * API response type
 */
export type ApiResponse<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

/**
 * Event handler type
 */
export type EventHandler<T = any> = (event: T) => void;
