/**
 * Utility functions for the sample project
 */

/**
 * Calculate the sum of two numbers
 * @param a First number
 * @param b Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Calculate the product of two numbers
 * @param a First number
 * @param b Second number
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Utility class for mathematical operations
 */
export class MathUtils {
  /**
   * Calculate the factorial of a number
   * @param n The number to calculate factorial for
   * @returns The factorial of n
   */
  static factorial(n: number): number {
    if (n <= 1) {return 1;}
    return n * this.factorial(n - 1);
  }
}
