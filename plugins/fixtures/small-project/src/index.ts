/**
 * Main entry point for the sample project
 */

import { add, multiply, MathUtils } from './utils';

/**
 * Main application class
 */
export class App {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Get the application name
   * @returns The application name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Run a calculation
   * @param x First number
   * @param y Second number
   * @returns Calculation result
   */
  calculate(x: number, y: number): number {
    const sum = add(x, y);
    const product = multiply(x, y);
    return sum + product;
  }
}

/**
 * Create a new application instance
 * @param name Application name
 * @returns New App instance
 */
export function createApp(name: string): App {
  return new App(name);
}

/**
 * Calculate factorial using MathUtils
 * @param n Number to calculate factorial for
 * @returns Factorial result
 */
export function calculateFactorial(n: number): number {
  return MathUtils.factorial(n);
}
