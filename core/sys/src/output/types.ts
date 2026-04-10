/**
 * @module @kb-labs/core-sys/output/types
 * Unified Output interface for KB Labs platform
 */

export type VerbosityLevel = "quiet" | "normal" | "verbose" | "debug" | "inspect";
export type OutputMode = "tty" | "pipe" | "ci";
export type DebugFormat = "human" | "ai";

export type OutputLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface OutputLogRecord {
    time: string;
    ts: string;
    level: OutputLogLevel;
    category?: string;
    msg: string;
    meta?: Record<string, unknown>;
}

export interface OutputLogSink {
    handle(record: OutputLogRecord): void | Promise<void>;
}

export interface OutputLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, error?: Error, meta?: Record<string, unknown>): void;
    debug(message: string, meta?: Record<string, unknown>): void;
    child(bindings: Record<string, unknown>): OutputLogger;
}

/**
 * Spinner interface for progress indicators
 */
export interface Spinner {
    start(): void;
    stop(): void;
    update(options: { text?: string }): void;
    succeed(message?: string): void;
    fail(message?: string): void;
}

/**
 * Progress details for progress() method
 */
export interface ProgressDetails {
    current?: number;
    total?: number;
    message?: string;
    [key: string]: unknown; // Index signature for extensibility
}

/**
 * Error options for error() method
 */
export interface ErrorOptions {
    title?: string;
    code?: string;
    suggestions?: string[];
    docs?: string;
    context?: Record<string, unknown>;
    report?: boolean; // Send to error reporting (Sentry)
}

/**
 * UI utilities interface
 */
export interface UIUtilities {
    box: (title: string, content?: string[], maxWidth?: number) => string;
    sideBox: (options: {
        title: string;
        sections: Array<{ header?: string; items: string[] }>;
        footer?: string;
        status?: 'success' | 'error' | 'warning' | 'info';
        timing?: number;
    }) => string;
    table: (rows: (string | number)[][], headers?: string[]) => string[];
    keyValue: (pairs: Record<string, string | number>, options?: { padKeys?: boolean }) => string[];
    spinner: (text: string, jsonMode?: boolean) => Spinner;
    colors: {
        info: (text: string) => string;
        warn: (text: string) => string;
        error: (text: string) => string;
        success: (text: string) => string;
        muted: (text: string) => string;
        bold: (text: string) => string;
        primary: (text: string) => string;
        accent: (text: string) => string;
    };
    symbols: {
        success: string;
        error: string;
        warning: string;
        info: string;
        bullet: string;
    };
}

/**
 * Unified Output interface for plugins and CLI
 */
export interface Output {
    // === Основной вывод (всегда виден, кроме --quiet) ===
    success(message: string, data?: Record<string, unknown>): void;
    error(error: Error | string, options?: ErrorOptions): void;
    warn(message: string, hint?: string): void;

    // === Прогресс (виден в normal/verbose) ===
    progress(stage: string, details?: ProgressDetails): void;
    spinner(text: string): Spinner;

    // === Информационный (только --verbose) ===
    info(message: string, meta?: Record<string, unknown>): void;

    // === Debug (только --debug) ===
    debug(message: string, meta?: Record<string, unknown>): void;
    trace(message: string, meta?: Record<string, unknown>): void;

    // === Специальный вывод ===
    json(data: unknown): void; // --json флаг
    write(text: string): void; // Raw output

    // === UI утилиты ===
    ui: UIUtilities;

    // === Группировка ===
    group(name: string): void;
    groupEnd(): void;

    // === Режимы ===
    readonly mode: OutputMode;
    readonly verbosity: VerbosityLevel;
    readonly isQuiet: boolean;
    readonly isVerbose: boolean;
    readonly isDebug: boolean;
    readonly isJSON: boolean;
    readonly isAIFormat: boolean;
}
