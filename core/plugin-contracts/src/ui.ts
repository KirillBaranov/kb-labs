/**
 * UI Facade for V3 Plugin System
 *
 * Provides a host-agnostic interface for user interaction.
 * Implementation varies by host:
 * - CLI: chalk/ora to stdout
 * - REST: Collected for response
 * - Workflow: Logged to run
 */

/**
 * Spinner interface for long-running operations
 */
export interface Spinner {
  /**
   * Update spinner message
   */
  update(message: string): void;

  /**
   * Mark as successful
   */
  succeed(message?: string): void;

  /**
   * Mark as failed
   */
  fail(message?: string): void;

  /**
   * Stop the spinner
   */
  stop(): void;
}

/**
 * Table column configuration
 */
export interface TableColumn {
  /** Column header */
  header: string;
  /** Property key in data objects */
  key: string;
  /** Column width (optional) */
  width?: number;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

/**
 * Color function type - takes a string and returns it wrapped in ANSI color codes
 */
export type ColorFunction = (text: string) => string;

/**
 * Colors API - strategic color application for semantic and accent colors
 */
export interface Colors {
  // Semantic colors
  success: ColorFunction;
  error: ColorFunction;
  warning: ColorFunction;
  info: ColorFunction;

  // Accent palette
  primary: ColorFunction;
  accent: ColorFunction;
  highlight: ColorFunction;
  secondary: ColorFunction;
  emphasis: ColorFunction;
  muted: ColorFunction;
  foreground: ColorFunction;

  // Formatting helpers
  dim: ColorFunction;
  bold: ColorFunction;
  underline: ColorFunction;
  inverse: ColorFunction;
}

/**
 * Symbols API - visual indicators and box-drawing characters
 */
export interface Symbols {
  // Status symbols
  success: string;
  error: string;
  warning: string;
  info: string;

  // UI elements
  bullet: string;
  clock: string;
  folder: string;
  package: string;
  pointer: string;
  section: string;

  // Box-drawing characters
  separator: string;
  border: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  leftT: string;
  rightT: string;
}

/**
 * UI Facade interface
 *
 * All output goes through this interface so plugins don't need to know
 * which entry point they're running in.
 */
export interface UIFacade {
  /**
   * Color utilities for semantic and accent colors
   *
   * Example:
   * ```
   * ctx.ui.write(ctx.ui.colors.success('✓ Success') + '\n');
   * ctx.ui.write(ctx.ui.colors.accent('Plugin loaded') + '\n');
   * ```
   */
  colors: Colors;

  /**
   * Symbol characters for visual indicators and box-drawing
   *
   * Example:
   * ```
   * ctx.ui.write(ctx.ui.symbols.success + ' Done\n');
   * ctx.ui.write(ctx.ui.symbols.pointer + ' Item\n');
   * ```
   */
  symbols: Symbols;

  /**
   * Write raw text to output (without newline)
   *
   * Use this for low-level output control. For most cases, prefer
   * info(), success(), warn(), error() which provide semantic formatting.
   *
   * @param text - Text to write (can include ANSI color codes)
   */
  write(text: string): void;

  /**
   * Print info message
   *
   * @param message - Main message text
   * @param options - Optional formatting options (title, sections, timing)
   */
  info(message: string, options?: MessageOptions): void;

  /**
   * Print success message (usually green)
   *
   * @param message - Main message text
   * @param options - Optional formatting options (title, sections, timing)
   */
  success(message: string, options?: MessageOptions): void;

  /**
   * Print warning message (usually yellow)
   *
   * @param message - Main message text
   * @param options - Optional formatting options (title, sections, timing)
   */
  warn(message: string, options?: MessageOptions): void;

  /**
   * Print error message/object (usually red)
   *
   * @param error - Error object or message string
   * @param options - Optional formatting options (title, sections, timing)
   */
  error(error: Error | string, options?: MessageOptions): void;

  /**
   * Print debug message (only shown in verbose mode)
   */
  debug(message: string): void;

  /**
   * Start a spinner/progress indicator
   *
   * Returns a Spinner that can be updated, succeeded, failed, or stopped.
   */
  spinner(message: string): Spinner;

  /**
   * Print a table of data
   *
   * @param data Array of objects to display
   * @param columns Optional column configuration
   */
  table(data: Record<string, unknown>[], columns?: TableColumn[]): void;

  /**
   * Print raw JSON (for --json mode)
   */
  json(data: unknown): void;

  /**
   * Print a newline
   */
  newline(): void;

  /**
   * Print a horizontal rule/divider
   */
  divider(): void;

  /**
   * Print a box with content
   */
  box(content: string, title?: string): void;

  /**
   * Print a structured side box with title, summary, sections, and timing
   *
   * Example:
   * ```
   * ctx.ui.sideBox({
   *   title: 'Hello Command',
   *   status: 'success',
   *   summary: {
   *     'Target': 'World',
   *     'Mode': 'production'
   *   },
   *   sections: [
   *     { header: 'Details', items: ['Item 1', 'Item 2'] }
   *   ],
   *   timing: 1234
   * });
   * ```
   */
  sideBox(options: SideBoxOptions): void;

  /**
   * Prompt for confirmation (CLI only, others return true)
   */
  confirm(message: string): Promise<boolean>;

  /**
   * Prompt for text input (CLI only, others throw)
   */
  prompt(message: string, options?: PromptOptions): Promise<string>;
}

/**
 * Options for text prompts
 */
export interface PromptOptions {
  /** Default value */
  default?: string;
  /** Whether to mask input (for passwords) */
  mask?: boolean;
  /** Validation function */
  validate?: (value: string) => boolean | string;
}

/**
 * Section for structured output (sideBox)
 */
export interface OutputSection {
  /** Section header (optional) */
  header?: string;
  /** List of items in this section */
  items: string[];
}

/**
 * Options for formatted output messages (info, success, warn)
 */
export interface MessageOptions {
  /** Optional title for the box (defaults to message type) */
  title?: string;
  /** Content sections to display in box */
  sections?: OutputSection[];
  /** Timing in milliseconds to display in footer */
  timing?: number;
}

/**
 * Options for sideBox structured output
 */
export interface SideBoxOptions {
  /** Box title */
  title: string;
  /** Status indicator */
  status?: 'success' | 'error' | 'info' | 'warning';
  /** Summary key-value pairs */
  summary?: Record<string, string | number | boolean>;
  /** Additional content sections */
  sections?: OutputSection[];
  /** Timing in milliseconds */
  timing?: number;
}

/**
 * No-op color functions (return text as-is)
 */
const noopColor = (text: string) => text;

/**
 * No-op colors implementation
 */
const noopColors: Colors = {
  success: noopColor,
  error: noopColor,
  warning: noopColor,
  info: noopColor,
  primary: noopColor,
  accent: noopColor,
  highlight: noopColor,
  secondary: noopColor,
  emphasis: noopColor,
  muted: noopColor,
  foreground: noopColor,
  dim: noopColor,
  bold: noopColor,
  underline: noopColor,
  inverse: noopColor,
};

/**
 * No-op symbols implementation (plain text fallback)
 */
const noopSymbols: Symbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: '→',
  bullet: '•',
  clock: 'time',
  folder: 'dir',
  package: '›',
  pointer: '>',
  section: '|',
  separator: '─',
  border: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  leftT: '├',
  rightT: '┤',
};

/**
 * No-op UI implementation (for testing or silent mode)
 */
export const noopUI: UIFacade = {
  colors: noopColors,
  symbols: noopSymbols,
  write: () => {},
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  spinner: () => ({
    update: () => {},
    succeed: () => {},
    fail: () => {},
    stop: () => {},
  }),
  table: () => {},
  json: () => {},
  newline: () => {},
  divider: () => {},
  box: () => {},
  sideBox: () => {},
  confirm: async () => true,
  prompt: async () => '',
};
