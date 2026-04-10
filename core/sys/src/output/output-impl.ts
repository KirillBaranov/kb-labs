/**
 * @module @kb-labs/core-sys/output/output-impl
 * Output implementation
 */

import type {
    Output,
    OutputMode,
    VerbosityLevel,
    DebugFormat,
    OutputLogSink,
    OutputLogRecord,
    OutputLogger,
    ErrorOptions,
    ProgressDetails,
    UIUtilities,
    Spinner,
} from "./types.js";
import {
    box,
    keyValue,
    table,
    createSpinner,
    safeColors,
    safeSymbols,
    sideBorderBox,
} from "@kb-labs/shared-cli-ui";
import { formatTable } from "@kb-labs/shared-cli-ui/table";

export class OutputImpl implements Output {
    constructor(
        private config: {
            mode: OutputMode;
            verbosity: VerbosityLevel;
            format: DebugFormat;
            json: boolean;
            sinks: OutputLogSink[]; // Только для форматированного вывода (ConsoleSink)
            logger: OutputLogger; // Глобальный logger для записи в файлы
            category?: string;
            context?: Record<string, unknown>;
        }
    ) {}

    // Getters
    get mode(): OutputMode {
        return this.config.mode;
    }

    get verbosity(): VerbosityLevel {
        return this.config.verbosity;
    }

    get isQuiet(): boolean {
        return this.config.verbosity === "quiet";
    }

    get isVerbose(): boolean {
        return ["verbose", "debug", "inspect"].includes(this.config.verbosity);
    }

    get isDebug(): boolean {
        return ["debug", "inspect"].includes(this.config.verbosity);
    }

    get isJSON(): boolean {
        return this.config.json;
    }

    get isAIFormat(): boolean {
        return this.config.format === "ai";
    }

    get ui(): UIUtilities {
        return {
            box,
            sideBox: sideBorderBox,
            table: (rows, headers) => {
                if (headers && headers.length > 0) {
                    return formatTable(
                        headers.map((h) => ({
                            header: h,
                            width: undefined,
                            align: "left" as const,
                        })),
                        rows.map((r) => r.map(String)),
                        { header: true }
                    );
                }
                return table(rows.map((r) => r.map(String)));
            },
            keyValue,
            spinner: (text: string, jsonMode?: boolean) =>
                createSpinner(text, jsonMode || this.isJSON),
            colors: {
                info: safeColors.info,
                warn: safeColors.warning,
                error: safeColors.error,
                success: safeColors.success,
                muted: safeColors.muted,
                bold: safeColors.bold,
                primary: safeColors.primary,
                accent: safeColors.accent,
            },
            symbols: {
                success: safeSymbols.success,
                error: safeSymbols.error,
                warning: safeSymbols.warning,
                info: safeSymbols.info,
                bullet: safeSymbols.bullet,
            },
        };
    }

    // Main methods
    success(message: string, data?: Record<string, unknown>): void {
        if (this.isJSON) {
            this.json({ ok: true, message, ...data });
            return;
        }

        if (this.isQuiet) {return;}

        const output = `${safeSymbols.success} ${message}`;
        console.log(safeColors.success(output));
        // Использовать глобальный logger для записи в файлы
        this.config.logger.info(message, data);
    }

    error(error: Error | string, options?: ErrorOptions): void {
        const message = error instanceof Error ? error.message : error;
        const stack = error instanceof Error ? error.stack : undefined;

        if (this.isJSON) {
            this.json({
                ok: false,
                error: {
                    message,
                    code: options?.code,
                    context: options?.context,
                    suggestions: options?.suggestions,
                },
            });
            return;
        }

        // Красивое форматирование ошибки
        const lines: string[] = [];

        if (options?.title) {
            lines.push(
                safeColors.error(`${safeSymbols.error} ${options.title}`)
            );
        }

        lines.push(safeColors.error(message));

        if (options?.code) {
            lines.push(safeColors.muted(`Code: ${options.code}`));
        }

        if (options?.context && Object.keys(options.context).length > 0) {
            lines.push("");
            lines.push(safeColors.bold("Context:"));
            lines.push(
                ...keyValue(
                    Object.fromEntries(
                        Object.entries(options.context).map(([k, v]) => [
                            k,
                            String(v),
                        ])
                    )
                )
            );
        }

        if (options?.suggestions && options.suggestions.length > 0) {
            lines.push("");
            lines.push(safeColors.bold("Suggestions:"));
            options.suggestions.forEach((s) => {
                lines.push(`  ${safeSymbols.bullet} ${s}`);
            });
        }

        if (options?.docs) {
            lines.push("");
            lines.push(safeColors.info(`Documentation: ${options.docs}`));
        }

        const boxed = box("Error", lines);
        console.error(boxed);

        // Использовать глобальный logger для записи в файлы
        const errorMeta: Record<string, unknown> = {
            code: options?.code,
            context: options?.context,
        };
        if (stack) {
            errorMeta.stack = stack;
        }
        if (error instanceof Error) {
            this.config.logger.error(message, error);
        } else {
            this.config.logger.error(message, undefined, errorMeta);
        }
    }

    warn(message: string, hint?: string): void {
        if (this.isQuiet) {return;}

        const output = `${safeSymbols.warning} ${message}`;
        console.warn(safeColors.warning(output));

        if (hint) {
            console.warn(safeColors.muted(`  ${hint}`));
        }

        // Использовать глобальный logger для записи в файлы
        this.config.logger.warn(message, { hint });
    }

    progress(stage: string, details?: ProgressDetails): void {
        if (this.isQuiet) {return;}

        let output = stage;
        if (details?.current !== undefined && details?.total !== undefined) {
            const percent = Math.round(
                (details.current / details.total) * 100
            );
            output += ` (${details.current}/${details.total}, ${percent}%)`;
        }

        if (details?.message) {
            output += ` - ${details.message}`;
        }

        console.log(safeColors.info(output));
        // Использовать глобальный logger для записи в файлы
        this.config.logger.info(output, details as Record<string, unknown>);
    }

    spinner(text: string): Spinner {
        return createSpinner(text, this.isJSON || this.isQuiet);
    }

    info(message: string, meta?: Record<string, unknown>): void {
        if (!this.isVerbose) {return;}

        console.log(message);
        // Использовать глобальный logger для записи в файлы
        this.config.logger.info(message, meta);
    }

    debug(message: string, meta?: Record<string, unknown>): void {
        if (!this.isDebug) {return;}

        console.log(safeColors.muted(message));
        // Использовать глобальный logger для записи в файлы
        this.config.logger.debug(message, meta);
    }

    trace(message: string, meta?: Record<string, unknown>): void {
        if (this.verbosity !== "inspect") {return;}

        console.log(safeColors.muted(`[TRACE] ${message}`));
        // Использовать глобальный logger для записи в файлы (trace → debug)
        this.config.logger.debug(message, { ...meta, trace: true } as Record<string, unknown>);
    }

    json(data: unknown): void {
        console.log(JSON.stringify(data, null, 2));
    }

    write(text: string): void {
        if (this.isQuiet) {return;}
        console.log(text);
    }

    group(name: string): void {
        if (this.isDebug) {
            console.group(name);
        }
    }

    groupEnd(): void {
        if (this.isDebug) {
            console.groupEnd();
        }
    }

    // Internal method для форматированного вывода через ConsoleSink
    // Используется только для UI вывода, не для записи в файлы
    private logToConsoleSink(
        level: OutputLogRecord["level"],
        msg: string,
        meta?: Record<string, unknown>
    ): void {
        const record: OutputLogRecord = {
            time: new Date().toISOString(),
            ts: new Date().toISOString(),
            level,
            category: this.config.category,
            msg,
            meta: { ...this.config.context, ...meta },
        };

        // Отправить только в ConsoleSink для форматированного вывода
        // Запись в файлы идет через глобальный logger
        for (const sink of this.config.sinks) {
            try {
                void sink.handle(record);
            } catch (err) {
                // Sink failures should not break execution
                console.error("Sink error:", err);
            }
        }
    }
}
