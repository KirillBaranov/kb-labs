/**
 * @module @kb-labs/core-sys/output/factory
 * Output factory with auto-detection
 */

import type { Output, OutputMode, VerbosityLevel, DebugFormat, OutputLogSink, OutputLogger } from "./types.js";
import { OutputImpl } from "./output-impl.js";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "silent";

class ConsoleLogger implements OutputLogger {
    constructor(
        private readonly level: LogLevel,
        private readonly bindings: Record<string, unknown> = {}
    ) {}

    private canLog(target: LogLevel): boolean {
        const rank: Record<LogLevel, number> = {
            silent: 0,
            error: 1,
            warn: 2,
            info: 3,
            debug: 4,
            trace: 5,
        };
        return rank[target] <= rank[this.level];
    }

    private withMeta(meta?: Record<string, unknown>): string {
        const merged = { ...this.bindings, ...(meta ?? {}) };
        return Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : "";
    }

    info(message: string, meta?: Record<string, unknown>): void {
        if (this.canLog("info")) {
            console.log(`[INFO] ${message}${this.withMeta(meta)}`);
        }
    }

    warn(message: string, meta?: Record<string, unknown>): void {
        if (this.canLog("warn")) {
            console.warn(`[WARN] ${message}${this.withMeta(meta)}`);
        }
    }

    error(message: string, error?: Error, meta?: Record<string, unknown>): void {
        if (this.canLog("error")) {
            const payload = error
                ? { ...meta, error: { message: error.message, stack: error.stack } }
                : meta;
            console.error(`[ERROR] ${message}${this.withMeta(payload)}`);
        }
    }

    debug(message: string, meta?: Record<string, unknown>): void {
        if (this.canLog("debug")) {
            console.debug(`[DEBUG] ${message}${this.withMeta(meta)}`);
        }
    }

    child(bindings: Record<string, unknown>): OutputLogger {
        return new ConsoleLogger(this.level, { ...this.bindings, ...bindings });
    }
}

export interface OutputConfig {
    verbosity?: VerbosityLevel; // Из флагов
    mode?: OutputMode; // Auto-detect или explicit
    format?: DebugFormat; // 'human' | 'ai'
    json?: boolean; // --json флаг
    sinks?: OutputLogSink[]; // Дополнительные sinks
    category?: string; // Категория для логов
    context?: {
        // Контекст команды
        plugin?: string;
        command?: string;
        trace?: string;
    };
}

export function createOutput(config: OutputConfig = {}): Output {
    // Auto-detect mode
    const mode: OutputMode = config.mode || detectMode();

    // Verbosity из конфига или normal по умолчанию
    const verbosity: VerbosityLevel = config.verbosity || "normal";

    // Format
    const format: DebugFormat =
        config.format || (config.json ? "ai" : "human");

    // Создать sinks только для форматированного вывода пользователю
    const sinks: OutputLogSink[] = config.sinks || [];

    const loggerLevel =
        verbosity === "inspect"
            ? "trace"
            : verbosity === "debug"
              ? "debug"
              : verbosity === "verbose"
                ? "info"
                : verbosity === "quiet"
                  ? "silent"
                  : "info";
    const logger = new ConsoleLogger(loggerLevel, {
        category: config.category || "output",
        ...(config.context || {}),
    });

    // Создать Output implementation
    return new OutputImpl({
        mode,
        verbosity,
        format,
        json: config.json || false,
        sinks, // Только ConsoleSink для UI
        logger, // Глобальный logger для записи в файлы
        category: config.category,
        context: config.context,
    });
}

function detectMode(): OutputMode {
    // CI environment
    if (process.env.CI === "true") {
        return "ci";
    }

    // TTY
    if (process.stdout.isTTY) {
        return "tty";
    }

    // Pipe
    return "pipe";
}
