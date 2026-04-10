/**
 * Presenter Contract V1
 *
 * Defines the interface for output presentation in the CLI framework.
 * Handles different output modes (TTY, JSON, quiet) and message types.
 */

/**
 * Presenter interface for CLI output
 *
 * Handles writing messages to stdout/stderr with support for:
 * - TTY detection (colors, formatting)
 * - JSON mode (structured output)
 * - Quiet mode (suppress non-essential output)
 */
export interface PresenterV1 {
  /** Whether the output is a TTY (terminal) */
  isTTY: boolean;

  /** Whether quiet mode is enabled (suppress non-essential output) */
  isQuiet: boolean;

  /** Whether JSON mode is enabled (output structured JSON) */
  isJSON: boolean;

  /**
   * Write a raw line to output
   * @param line - Text to write
   */
  write(line: string): void;

  /**
   * Write an info message
   * @param line - Info message text
   */
  info(line: string): void;

  /**
   * Write a warning message
   * @param line - Warning message text
   */
  warn(line: string): void;

  /**
   * Write an error message
   * @param line - Error message text
   */
  error(line: string): void;

  /**
   * Output structured JSON data
   * @param payload - Data to serialize as JSON
   */
  json(payload: unknown): void;
}
