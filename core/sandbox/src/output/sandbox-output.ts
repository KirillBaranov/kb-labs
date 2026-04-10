/**
 * @module @kb-labs/core-sandbox/output/sandbox-output
 * Output implementation for sandbox subprocess with IPC integration
 */

import type { Output, ErrorOptions, ProgressDetails, Spinner } from "@kb-labs/core-sys/output";
import { createOutput, type OutputConfig } from "@kb-labs/core-sys/output";

/**
 * SandboxOutput - Output implementation for subprocess
 * Sends logs via IPC to parent process and outputs to stdout/stderr
 */
export class SandboxOutput implements Output {
    private baseOutput: Output;
    private originalConsole: {
        log: typeof console.log;
        warn: typeof console.warn;
        error: typeof console.error;
        debug: typeof console.debug;
    };

    constructor(config: OutputConfig) {
        this.baseOutput = createOutput(config);
        
        // Сохранить оригинальные console методы
        this.originalConsole = {
            log: console.log.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
            debug: console.debug.bind(console),
        };
    }

    // Delegate to baseOutput with IPC forwarding
    success(message: string, data?: Record<string, unknown>): void {
        this.sendLog("info", message, data);
        this.baseOutput.success(message, data);
    }

    error(error: Error | string, options?: ErrorOptions): void {
        const message = error instanceof Error ? error.message : error;
        const stack = error instanceof Error ? error.stack : undefined;
        
        this.sendLog("error", message, {
            ...options,
            stack,
        });
        this.baseOutput.error(error, options);
    }

    warn(message: string, hint?: string): void {
        this.sendLog("warn", message, { hint });
        this.baseOutput.warn(message, hint);
    }

    progress(stage: string, details?: ProgressDetails): void {
        this.sendLog("info", stage, details);
        this.baseOutput.progress(stage, details);
    }

    spinner(text: string): Spinner {
        return this.baseOutput.spinner(text);
    }

    info(message: string, meta?: Record<string, unknown>): void {
        this.sendLog("info", message, meta);
        this.baseOutput.info(message, meta);
    }

    debug(message: string, meta?: Record<string, unknown>): void {
        this.sendLog("debug", message, meta);
        this.baseOutput.debug(message, meta);
    }

    trace(message: string, meta?: Record<string, unknown>): void {
        this.sendLog("debug", message, meta); // trace → debug для IPC
        this.baseOutput.trace(message, meta);
    }

    json(data: unknown): void {
        this.baseOutput.json(data);
    }

    write(text: string): void {
        this.sendLog("info", text);
        this.baseOutput.write(text);
    }

    get ui() {
        return this.baseOutput.ui;
    }

    group(name: string): void {
        this.baseOutput.group(name);
    }

    groupEnd(): void {
        this.baseOutput.groupEnd();
    }

    get mode() {
        return this.baseOutput.mode;
    }

    get verbosity() {
        return this.baseOutput.verbosity;
    }

    get isQuiet() {
        return this.baseOutput.isQuiet;
    }

    get isVerbose() {
        return this.baseOutput.isVerbose;
    }

    get isDebug() {
        return this.baseOutput.isDebug;
    }

    get isJSON() {
        return this.baseOutput.isJSON;
    }

    get isAIFormat() {
        return this.baseOutput.isAIFormat;
    }

    /**
     * Send log message via IPC to parent process
     */
    private sendLog(
        level: "info" | "warn" | "error" | "debug",
        message: string,
        meta?: Record<string, unknown>
    ): void {
        if (!process.send) {
            // Not in subprocess, skip IPC
            return;
        }

        try {
            process.send({
                type: "LOG",
                payload: {
                    level,
                    message,
                    meta: meta || {},
                    timestamp: new Date().toISOString(),
                },
            });
        } catch (e) {
            // Ignore IPC errors silently
            // Fallback to console if IPC fails
            if (level === "error") {
                this.originalConsole.error(message, meta);
            } else if (level === "warn") {
                this.originalConsole.warn(message, meta);
            } else if (level === "debug") {
                this.originalConsole.debug(message, meta);
            } else {
                this.originalConsole.log(message, meta);
            }
        }
    }
}

/**
 * Create SandboxOutput for subprocess
 */
export function createSandboxOutput(config: OutputConfig): Output {
    return new SandboxOutput(config);
}


